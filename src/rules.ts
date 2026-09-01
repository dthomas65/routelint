import type { Route } from './parser.js'

export type Severity = 'error' | 'warning'

export interface Finding {
  line: number
  col: number
  length: number
  severity: Severity
  rule: string
  message: string
}

const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

export function checkRoutes(routes: Route[]): Finding[] {
  const findings: Finding[] = []

  for (const route of routes) {
    findings.push(...checkMethod(route))
    findings.push(...checkPath(route))
  }

  findings.push(...checkDuplicateRoutes(routes))
  findings.push(...checkShadowedRoutes(routes))

  return findings.sort((a, b) => a.line - b.line || a.col - b.col)
}

function checkMethod(route: Route): Finding[] {
  const upper = route.method.toUpperCase()

  if (!KNOWN_METHODS.has(upper)) {
    return [{
      line: route.line,
      col: route.methodCol,
      length: route.method.length,
      severity: 'error',
      rule: 'unknown-method',
      message: `"${route.method}" is not a known HTTP method (expected one of ${[...KNOWN_METHODS].join(', ')})`,
    }]
  }

  if (route.method !== upper) {
    return [{
      line: route.line,
      col: route.methodCol,
      length: route.method.length,
      severity: 'warning',
      rule: 'method-case',
      message: `HTTP method "${route.method}" should be uppercase ("${upper}")`,
    }]
  }

  return []
}

const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

interface ParsedParam {
  name: string
  pattern: string | null
}

// A param segment is ":name" or ":name(pattern)", e.g. ":id(\d+)". The
// pattern is whatever sits between the first "(" and the final ")" - nested
// parens in the pattern itself aren't supported.
function parseParamSegment(segment: string): ParsedParam | { malformed: true } {
  const body = segment.slice(1)
  const parenIndex = body.indexOf('(')
  if (parenIndex === -1) return { name: body, pattern: null }
  if (!body.endsWith(')')) return { malformed: true }
  return { name: body.slice(0, parenIndex), pattern: body.slice(parenIndex + 1, -1) }
}

function checkPath(route: Route): Finding[] {
  const findings: Finding[] = []
  const { path, pathCol, line } = route

  if (!path.startsWith('/')) {
    findings.push({
      line,
      col: pathCol,
      length: path.length,
      severity: 'error',
      rule: 'missing-leading-slash',
      message: `path "${path}" must start with "/"`,
    })
  }

  if (path.length > 1 && path.endsWith('/')) {
    findings.push({
      line,
      col: pathCol + path.length - 1,
      length: 1,
      severity: 'warning',
      rule: 'trailing-slash',
      message: `path "${path}" has a trailing slash; most routers treat this as a different path than the one without it`,
    })
  }

  const doubleSlash = path.indexOf('//')
  if (doubleSlash !== -1) {
    findings.push({
      line,
      col: pathCol + doubleSlash,
      length: 2,
      severity: 'error',
      rule: 'empty-segment',
      message: `path "${path}" contains an empty segment ("//")`,
    })
  }

  const seenParams = new Set<string>()
  let offset = 0
  for (const segment of path.split('/')) {
    if (segment.startsWith(':')) {
      const parsed = parseParamSegment(segment)

      if ('malformed' in parsed) {
        findings.push({
          line,
          col: pathCol + offset,
          length: segment.length,
          severity: 'error',
          rule: 'malformed-param-pattern',
          message: `parameter "${segment}" has an unclosed "(" in its pattern`,
        })
        offset += segment.length + 1
        continue
      }

      const { name, pattern } = parsed

      if (name.length === 0) {
        findings.push({
          line,
          col: pathCol + offset,
          length: 1,
          severity: 'error',
          rule: 'empty-param-name',
          message: `path "${path}" has a parameter with no name (just ":")`,
        })
      } else if (!PARAM_NAME_RE.test(name)) {
        findings.push({
          line,
          col: pathCol + offset,
          length: 1 + name.length,
          severity: 'error',
          rule: 'invalid-param-name',
          message: `":${name}" is not a valid parameter name (must match [A-Za-z_][A-Za-z0-9_]*)`,
        })
      } else if (pattern !== null) {
        const patternCol = pathCol + offset + 1 + name.length + 1
        if (pattern.length === 0) {
          findings.push({
            line,
            col: patternCol - 1,
            length: 2,
            severity: 'error',
            rule: 'empty-param-pattern',
            message: `parameter ":${name}" has an empty pattern ("()")`,
          })
        } else {
          try {
            new RegExp(pattern)
          } catch (err) {
            findings.push({
              line,
              col: patternCol,
              length: pattern.length,
              severity: 'error',
              rule: 'invalid-param-pattern',
              message: `parameter ":${name}" has an invalid regex pattern "${pattern}": ${(err as Error).message}`,
            })
          }
        }
      }

      if (name.length > 0) {
        if (seenParams.has(name)) {
          findings.push({
            line,
            col: pathCol + offset,
            length: 1 + name.length,
            severity: 'error',
            rule: 'duplicate-param-name',
            message: `parameter ":${name}" is used more than once in path "${path}"`,
          })
        } else {
          seenParams.add(name)
        }
      }
    }
    offset += segment.length + 1
  }

  return findings
}

function checkDuplicateRoutes(routes: Route[]): Finding[] {
  const seen = new Map<string, Route>()
  const findings: Finding[] = []

  for (const route of routes) {
    const key = `${route.method.toUpperCase()} ${normalizePath(route.path)}`
    const existing = seen.get(key)

    if (existing) {
      const identical = route.path === existing.path
      findings.push({
        line: route.line,
        col: route.methodCol,
        length: route.method.length + 1 + route.path.length,
        severity: 'error',
        rule: identical ? 'duplicate-route' : 'ambiguous-route',
        message: identical
          ? `route "${route.method.toUpperCase()} ${route.path}" duplicates the one declared on line ${existing.line}`
          : `route "${route.method.toUpperCase()} ${route.path}" has the same shape as "${existing.method.toUpperCase()} ${existing.path}" on line ${existing.line}; a router cannot tell them apart`,
      })
    } else {
      seen.set(key, route)
    }
  }

  return findings
}

function normalizePath(path: string): string {
  return path.replace(/:[A-Za-z_][A-Za-z0-9_]*(\([^)]*\))?/g, ':param')
}

type SegmentComparison = 'distinct' | 'duplicate' | 'shadow'

// Same idea as normalizePath but segment by segment, and it distinguishes
// "same shape" (already caught by checkDuplicateRoutes) from "earlier route
// has a param where the later one has a static segment", which is the
// registration-order bug: a router tries routes in declaration order and
// the param swallows the static value before the later route ever gets a
// chance to match.
function compareSegments(earlier: string[], later: string[]): SegmentComparison {
  let hasShadowingSegment = false

  for (let i = 0; i < earlier.length; i++) {
    const a = earlier[i]
    const b = later[i]
    const aIsParam = a.startsWith(':')
    const bIsParam = b.startsWith(':')

    if (!aIsParam && !bIsParam) {
      if (a !== b) return 'distinct'
      continue
    }

    if (aIsParam && bIsParam) continue

    if (aIsParam && !bIsParam) {
      hasShadowingSegment = true
      continue
    }

    // earlier is static, later is param: the earlier route only intercepts
    // that one literal value, the later route stays reachable for everything
    // else, so this isn't the shadowing bug.
    return 'distinct'
  }

  return hasShadowingSegment ? 'shadow' : 'duplicate'
}

function checkShadowedRoutes(routes: Route[]): Finding[] {
  const findings: Finding[] = []

  for (let j = 0; j < routes.length; j++) {
    const later = routes[j]
    const laterMethod = later.method.toUpperCase()
    const laterSegments = later.path.split('/')

    for (let i = 0; i < j; i++) {
      const earlier = routes[i]
      if (earlier.method.toUpperCase() !== laterMethod) continue

      const earlierSegments = earlier.path.split('/')
      if (earlierSegments.length !== laterSegments.length) continue

      const comparison = compareSegments(earlierSegments, laterSegments)
      if (comparison === 'distinct') continue

      if (comparison === 'shadow') {
        findings.push({
          line: later.line,
          col: later.methodCol,
          length: later.method.length + 1 + later.path.length,
          severity: 'error',
          rule: 'shadowed-route',
          message: `route "${laterMethod} ${later.path}" is shadowed by "${earlier.method.toUpperCase()} ${earlier.path}" declared on line ${earlier.line}, which matches first and will always run instead`,
        })
      }

      // Whether this earlier route shadowed the later one or is just an
      // exact duplicate (already reported by checkDuplicateRoutes), it's
      // the first route that would actually claim this request, so there's
      // no point comparing against anything declared after it.
      break
    }
  }

  return findings
}

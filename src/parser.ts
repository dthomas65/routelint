// Parses a route manifest: one "METHOD /path" declaration per line, blank
// lines and lines starting with "#" ignored. Column numbers are 1-based and
// point at the exact token, since that's what makes the CLI output usable.

export interface Route {
  method: string
  methodCol: number
  path: string
  pathCol: number
  line: number
  raw: string
}

export interface ParseError {
  line: number
  col: number
  length: number
  message: string
}

export interface ParseResult {
  routes: Route[]
  errors: ParseError[]
}

interface Token {
  text: string
  col: number
}

export function parseRoutes(source: string): ParseResult {
  const routes: Route[] = []
  const errors: ParseError[] = []
  const lines = source.split(/\r\n|\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const tokens = tokenize(raw)
    if (tokens.length === 0) continue

    if (tokens.length < 2) {
      const tok = tokens[0]
      errors.push({
        line: lineNumber,
        col: tok.col,
        length: tok.text.length,
        message: `expected "METHOD /path" but only found "${tok.text}"`,
      })
      continue
    }

    if (tokens.length > 2) {
      const extra = tokens[2]
      errors.push({
        line: lineNumber,
        col: extra.col,
        length: raw.length - extra.col + 1,
        message: `unexpected text after path: "${raw.slice(extra.col - 1).trim()}"`,
      })
      continue
    }

    const [methodTok, pathTok] = tokens
    routes.push({
      method: methodTok.text,
      methodCol: methodTok.col,
      path: pathTok.text,
      pathCol: pathTok.col,
      line: lineNumber,
      raw,
    })
  }

  return { routes, errors }
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  const re = /\S+/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line)) !== null) {
    tokens.push({ text: match[0], col: match.index + 1 })
  }
  return tokens
}

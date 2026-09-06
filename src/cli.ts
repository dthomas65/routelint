#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseRoutes } from './parser.js'
import { checkRoutes, type Severity } from './rules.js'

type OutputFormat = 'text' | 'json'

interface CliOptions {
  filePath: string
  format: OutputFormat
}

interface Problem {
  line: number
  col: number
  length: number
  severity: Severity
  rule: string
  message: string
}

function parseArgs(argv: string[]): CliOptions {
  let format: OutputFormat = 'text'
  let filePath: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--format') {
      format = parseFormat(argv[++i])
    } else if (arg.startsWith('--format=')) {
      format = parseFormat(arg.slice('--format='.length))
    } else if (filePath === undefined) {
      filePath = arg
    } else {
      process.stderr.write(`routelint: unexpected argument "${arg}"\n`)
      process.exit(2)
    }
  }

  if (filePath === undefined) {
    process.stderr.write('usage: routelint [--format text|json] <routes-file>\n')
    process.exit(2)
  }

  return { filePath, format }
}

function parseFormat(value: string | undefined): OutputFormat {
  if (value === 'text' || value === 'json') return value
  process.stderr.write(`routelint: unknown format "${value ?? ''}" (expected "text" or "json")\n`)
  process.exit(2)
}

function main(): void {
  const { filePath, format } = parseArgs(process.argv.slice(2))

  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch (err) {
    process.stderr.write(`routelint: cannot read "${filePath}": ${(err as Error).message}\n`)
    process.exit(2)
    return
  }

  const lines = source.split(/\r\n|\n/)
  const { routes, errors } = parseRoutes(source)
  const findings = checkRoutes(routes)

  const problems: Problem[] = [
    ...errors.map((error) => ({
      line: error.line,
      col: error.col,
      length: error.length,
      severity: 'error' as const,
      rule: 'parse-error',
      message: error.message,
    })),
    ...findings.map((finding) => ({
      line: finding.line,
      col: finding.col,
      length: finding.length,
      severity: finding.severity,
      rule: finding.rule,
      message: finding.message,
    })),
  ].sort((a, b) => a.line - b.line || a.col - b.col)

  const errorCount = problems.filter((p) => p.severity === 'error').length
  const warningCount = problems.length - errorCount

  if (format === 'json') {
    process.stdout.write(
      JSON.stringify(
        { file: filePath, routesChecked: routes.length, problems, errorCount, warningCount },
        null,
        2
      ) + '\n'
    )
    process.exit(errorCount > 0 ? 1 : 0)
  }

  for (const problem of problems) {
    printProblem(filePath, lines, problem.line, problem.col, problem.length, problem.severity, problem.message)
  }

  if (errorCount === 0 && warningCount === 0) {
    process.stdout.write(`${filePath}: no problems found (${routes.length} routes checked)\n`)
    process.exit(0)
  }

  process.stdout.write(`${errorCount} error(s), ${warningCount} warning(s)\n`)
  process.exit(errorCount > 0 ? 1 : 0)
}

function printProblem(
  filePath: string,
  lines: string[],
  line: number,
  col: number,
  length: number,
  severity: 'error' | 'warning',
  message: string
): void {
  const sourceLine = lines[line - 1] ?? ''
  const gutter = String(line)
  const pad = ' '.repeat(gutter.length)
  const caretPad = ' '.repeat(Math.max(0, col - 1))
  const caret = '^'.repeat(Math.max(1, length))

  process.stdout.write(`${filePath}:${line}:${col}: ${severity}: ${message}\n`)
  process.stdout.write(`${pad} |\n`)
  process.stdout.write(`${gutter} | ${sourceLine}\n`)
  process.stdout.write(`${pad} | ${caretPad}${caret}\n\n`)
}

main()

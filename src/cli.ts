#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseRoutes } from './parser.js'
import { checkRoutes } from './rules.js'

function main(): void {
  const filePath = process.argv[2]
  if (!filePath) {
    process.stderr.write('usage: routelint <routes-file>\n')
    process.exit(2)
  }

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

  let errorCount = 0
  let warningCount = 0

  for (const error of errors) {
    printProblem(filePath, lines, error.line, error.col, error.length, 'error', error.message)
    errorCount++
  }

  for (const finding of findings) {
    printProblem(filePath, lines, finding.line, finding.col, finding.length, finding.severity, finding.message)
    if (finding.severity === 'error') errorCount++
    else warningCount++
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

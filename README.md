# routelint

A linter for plain-text URL route tables.

Some codebases keep a flat manifest of every route the service exposes,
separate from the framework code that actually registers them: a doc for API
consumers, an input to a gateway config generator, a checklist for whoever's
reviewing the PR. These files rot the same way any hand-maintained list does.
Someone copies a line to add a new endpoint and forgets to change the path.
Two people add the same resource under slightly different parameter names and
now `/users/:id` and `/users/:userId` both exist and no router can tell them
apart. A stray double slash sits there for six months because nothing ever
checked.

routelint reads one of these files and reports exactly what's wrong, with
the line and column of the offending token, so you can jump straight to it.

## The format

One route per line: an HTTP method, whitespace, a path. Blank lines and
lines starting with `#` are ignored.

```
GET  /users
GET  /users/:id
POST /users
DELETE /users/:id
GET  /users/:id/posts/:postId
```

A parameter can carry a regex constraint in parentheses, the way frameworks
like Fastify or Express-with-`path-to-regexp` write it: `:id(\d+)`. routelint
checks that the pattern is a name followed by a valid, non-empty regular
expression with a matching closing paren; it doesn't yet use the pattern
itself to tell two otherwise-identical routes apart (see below).

## Usage

```
npm run build
node dist/cli.js routes.txt
```

Given this `routes.txt`:

```
GET /users
GET /users/:id
get /users/:id
POST /users//bulk
GET /users/:id/comments/:id
```

it reports:

```
routes.txt:3:1: warning: HTTP method "get" should be uppercase ("GET")
  |
3 | get /users/:id
  | ^^^

routes.txt:3:1: error: route "GET /users/:id" duplicates the one declared on line 2
  |
3 | get /users/:id
  | ^^^^^^^^^^^^^^

routes.txt:4:12: error: path "/users//bulk" contains an empty segment ("//")
  |
4 | POST /users//bulk
  |            ^^

routes.txt:5:25: error: parameter ":id" is used more than once in path "/users/:id/comments/:id"
  |
5 | GET /users/:id/comments/:id
  |                         ^^^

3 error(s), 1 warning(s)
```

Exit code is 1 if any errors were found, 0 otherwise (warnings alone don't
fail the run).

### JSON output

Pass `--format json` to get a single JSON document on stdout instead of the
human-readable report, for editors and other tools to consume:

```
node dist/cli.js --format json routes.txt
```

```json
{
  "file": "routes.txt",
  "routesChecked": 5,
  "problems": [
    { "line": 3, "col": 1, "length": 3, "severity": "warning", "rule": "method-case", "message": "HTTP method \"get\" should be uppercase (\"GET\")" },
    { "line": 3, "col": 1, "length": 14, "severity": "error", "rule": "duplicate-route", "message": "route \"GET /users/:id\" duplicates the one declared on line 2" },
    { "line": 4, "col": 12, "length": 2, "severity": "error", "rule": "empty-segment", "message": "path \"/users//bulk\" contains an empty segment (\"//\")" },
    { "line": 5, "col": 25, "length": 3, "severity": "error", "rule": "duplicate-param-name", "message": "parameter \":id\" is used more than once in path \"/users/:id/comments/:id\"" }
  ],
  "errorCount": 3,
  "warningCount": 1
}
```

Parse errors and lint findings share the same shape (`rule` is
`"parse-error"` for the former) and are sorted together by line and column,
so a tool can walk `problems` in one pass without merging two lists itself.

### YAML output

Pass `--format yaml` for the same document as `--format json`, serialized as
YAML instead, for tools that prefer to read config-shaped output that way:

```
node dist/cli.js --format yaml routes.txt
```

```yaml
file: "routes.txt"
routesChecked: 5
problems:
  - line: 3
    col: 1
    length: 3
    severity: warning
    rule: method-case
    message: "HTTP method \"get\" should be uppercase (\"GET\")"
  - line: 3
    col: 1
    length: 14
    severity: error
    rule: duplicate-route
    message: "route \"GET /users/:id\" duplicates the one declared on line 2"
errorCount: 3
warningCount: 1
```

## Checks implemented so far

- unknown HTTP method
- method not uppercase
- path missing a leading slash
- trailing slash
- empty path segment (`//`)
- empty or invalid parameter name
- malformed, empty, or invalid parameter pattern (`:id(`, `:id()`, `:id(\d+++)`)
- duplicate parameter name within one path
- duplicate route (same method and path)
- ambiguous route (same method and shape, different parameter names)
- route shadowed by an earlier, more generic route: `GET /users/:id`
  declared before `GET /users/new` means the second line never matches,
  since the router tries routes in order and the param swallows `new` first

## What this doesn't do yet

It only understands its own flat text format. It doesn't read your actual
Express/Koa/whatever route registrations.

It also treats `:id` and `:id(\d+)` as the same shape when checking for
duplicate, ambiguous, and shadowed routes, since it doesn't yet reason about
whether one pattern is a subset of another.

Requires Node 18+ and a TypeScript compiler to build. Nothing in `src/`
depends on anything beyond Node's standard library.

## License

MIT, see LICENSE.

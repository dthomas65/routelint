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

## Checks implemented so far

- unknown HTTP method
- method not uppercase
- path missing a leading slash
- trailing slash
- empty path segment (`//`)
- empty or invalid parameter name
- duplicate parameter name within one path
- duplicate route (same method and path)
- ambiguous route (same method and shape, different parameter names)

## What this doesn't do yet

It only understands its own flat text format. It doesn't read your actual
Express/Koa/whatever route registrations, and it doesn't know that
`/users/:id` and `/users/new` can collide depending on registration order.
Both are worth having eventually; neither is here yet.

Requires Node 18+ and a TypeScript compiler to build. Nothing in `src/`
depends on anything beyond Node's standard library.

## License

MIT, see LICENSE.

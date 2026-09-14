# zod-contract

Zod schemas → OpenAPI 3.x components (default 3.2) + JSON examples. Zero wrapping, zero config.

```ts
import { z } from 'zod'

export const User = z.object({
  id:    z.string().uuid().default('9b1deb4d-...'),
  email: z.string().email().default('a@b.com')
})
```

```bash
$ npx @aemrezorlu/zod-contract build src/api api
✓ 1 schema → 2 files in api
```

```
api/
├── components/schemas/User.yaml   # OpenAPI 3.1 schema
├── examples/user.json              # JSON example
└── index.yaml                      # OpenAPI 3.1 root
```

## Why

Most Zod → OpenAPI tools force you to wrap every schema:

```ts
// the old way
const User = z.object({...}).openapi('User')
```

zod-contract skips that step. The schema is the contract.

## Cross-schema references

When a sub-schema is the same instance as a top-level export, it's emitted as a `$ref`:

```ts
export const Address = z.object({ city: z.string() })
export const User = z.object({ name: z.string(), address: Address })
```

```yaml
User:
  type: object
  properties:
    name: { type: string }
    address: { $ref: '#/components/schemas/Address' }
  required: [name, address]
```

Wrappers carry the marker through:

- `Schema.optional()` → `$ref` (optional drops the field from `required`)
- `Schema.nullable()` → `$ref` with `nullable: true` (stays in `required` in OpenAPI 3.1)
- `Schema.default(x)` → `$ref` with `example: x`
- `z.array(Schema)` → `type: array` with `items: { $ref }`
- `z.union([A, B])` → `oneOf` with `$ref`s for registered members

**Bidirectional refs** (User→Address and Address→User in the same file) require `z.lazy()`,
which the current skeleton does not handle. Declare in one direction or split into multiple files.

## Example values

In Zod 3, attach example data with `.default(value)`. Zod 4 (when stable) will also
support `.example(value)` natively; the converter already reads both.

```ts
export const User = z.object({
  email: z.string().email().default('ada@example.com')
})
// → examples/user.json: { "email": "ada@example.com", ... }
```

Fields without a default get a heuristic example (`"string"`, `0`, `false`, `[]`, ...).

## Install

```bash
npm install --save-dev @aemrezorlu/zod-contract
```

Peer dep: `zod` ^3.23.

## CLI

### `build`

```bash
zod-contract build <src> <out>
zod-contract build <src> <out> --format json
```

- `<src>` — a `.ts` file or a directory (walks recursively, skips `*.test.ts` and `*.d.ts`)
- `<out>` — output directory (created if missing)
- `--format yaml|json` — schema + index file format; examples are always JSON

Output:
- `components/schemas/<Name>.{yaml,json}` — one OpenAPI 3.1 schema per export
- `examples/<name>.json` — JSON example extracted from `.example()` / `.default()` / heuristic
- `index.{yaml,json}` — OpenAPI 3.1 root that $refs all schemas

### `watch`

```bash
zod-contract watch <src> <out>
zod-contract watch <src> <out> --format json --debounce 200
```

Initial build, then incremental rebuilds on any source change. Debounce collapses
rapid bursts (e.g. editor save chains). Ctrl-C to stop.

## Supported Zod types

`ZodString` (with `uuid`, `email`, `url`, `datetime`, `regex`, `min`/`max` length),
`ZodNumber` (with `int`, `min`/`max`), `ZodBoolean`, `ZodNull`, `ZodBigInt`, `ZodDate`,
`ZodArray`, `ZodObject` (with `required` tracking and `catchall`),
`ZodEnum` / `ZodNativeEnum`, `ZodLiteral`, `ZodOptional`, `ZodNullable`,
`ZodDefault`, `ZodUnion`, `ZodDiscriminatedUnion`, `ZodRecord`, `ZodAny`, `ZodUnknown`.

Unknown types emit `{}` rather than failing.

## Plugin extension surface

```ts
import type { Plugin } from '@aemrezorlu/zod-contract'

const myPlugin: Plugin = {
  name: 'example',
  transformSchema(schema, info) {
    // mutate and return
    return schema
  },
  finalize(ctx) {
    // add files to ctx.outputs
    ctx.outputs.set('paths/users.yaml', '...')
    return ctx
  },
}
```

Shipped plugins:
- [`@aemrezorlu/zod-contract-paths`](https://www.npmjs.com/package/@aemrezorlu/zod-contract-paths) — file-based routing → OpenAPI `paths.yaml`
- [`@aemrezorlu/zod-contract-hono`](https://www.npmjs.com/package/@aemrezorlu/zod-contract-hono) — Hono `app.routes` → OpenAPI `paths.yaml`
- [`@aemrezorlu/zod-contract-trpc`](https://www.npmjs.com/package/@aemrezorlu/zod-contract-trpc) — tRPC `appRouter` → OpenAPI `paths.yaml`

## Programmatic API

```ts
import { build } from '@aemrezorlu/zod-contract'

await build({ src: 'src/api', out: 'api' })
```

## License

MIT

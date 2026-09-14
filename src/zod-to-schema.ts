// Zod → OpenAPI 3.x (JSON Schema 2020-12 compatible) converter.
// Registry-aware: when a sub-schema matches a top-level Zod instance,
// emits `#/components/schemas/<Name>` instead of inlining.

import type { ZodTypeAny } from 'zod'
import type { OpenAPISchema, SchemaInfo } from './types.js'
import { extractExample } from './examples.js'

export function zodToOpenAPI(
  info: SchemaInfo,
  registry: Map<ZodTypeAny, string> = new Map(),
): OpenAPISchema {
  // exempt = this schema (don't emit self-ref at top level).
  return convert(info.zod, registry, info.zod, new Set())
}

function convert(
  schema: ZodTypeAny,
  registry: Map<ZodTypeAny, string>,
  exempt: ZodTypeAny,
  walking: Set<ZodTypeAny>,
): OpenAPISchema {
  const def = (schema as { _def?: Record<string, unknown> })._def ?? {}
  const typeName = def.typeName as string | undefined

  // Cycle: if we're already walking through this and it's in the registry → ref.
  if (walking.has(schema) && registry.has(schema)) {
    return { $ref: refPath(registry.get(schema)!) }
  }

  // Cross-schema ref: emit ref if registered and not the top-level exempt.
  if (registry.has(schema) && schema !== exempt) {
    return { $ref: refPath(registry.get(schema)!) }
  }

  let out: OpenAPISchema = {}

  switch (typeName) {
    case 'ZodString': {
      out = { type: 'string' }
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: unknown; regex?: RegExp }>
      for (const c of checks) {
        if (c.kind === 'uuid') out.format = 'uuid'
        else if (c.kind === 'email') out.format = 'email'
        else if (c.kind === 'url') out.format = 'uri'
        else if (c.kind === 'datetime' || c.kind === 'iso') out.format = 'date-time'
        else if (c.kind === 'min' && typeof c.value === 'number') out.minLength = c.value
        else if (c.kind === 'max' && typeof c.value === 'number') out.maxLength = c.value
        else if (c.kind === 'regex' && c.regex instanceof RegExp) out.pattern = c.regex.source
      }
      break
    }
    case 'ZodNumber': {
      out = { type: 'number' }
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: number }>
      for (const c of checks) {
        if (c.kind === 'int') out.type = 'integer'
        else if (c.kind === 'min' && typeof c.value === 'number') out.minimum = c.value
        else if (c.kind === 'max' && typeof c.value === 'number') out.maximum = c.value
      }
      break
    }
    case 'ZodBoolean': out = { type: 'boolean' }; break
    case 'ZodNull': out = { type: 'null' }; break
    case 'ZodBigInt': out = { type: 'integer', format: 'int64' }; break
    case 'ZodDate': out = { type: 'string', format: 'date-time' }; break

    case 'ZodArray': {
      const inner = def.type as ZodTypeAny
      out = { type: 'array', items: convert(inner, registry, exempt, walking) }
      const exact = (def as { exactLength?: { value: number } }).exactLength
      const min = (def as { minLength?: { value: number } }).minLength
      const max = (def as { maxLength?: { value: number } }).maxLength
      if (exact) out.minimum = exact.value
      if (min) out.minLength = min.value
      if (max) out.maxLength = max.value
      break
    }

    case 'ZodObject': {
      const shapeFn = def.shape as () => Record<string, ZodTypeAny>
      const shape = typeof shapeFn === 'function' ? shapeFn() : {}
      const properties: Record<string, OpenAPISchema> = {}
      const required: string[] = []

      walking.add(schema)
      try {
        for (const [key, sub] of Object.entries(shape)) {
          properties[key] = convert(sub, registry, exempt, walking)
          if ((sub as { _def?: { typeName?: string } })._def?.typeName !== 'ZodOptional') {
            required.push(key)
          }
        }
      } finally {
        walking.delete(schema)
      }

      out = { type: 'object', properties }
      if (required.length > 0) out.required = required
      const catchall = (def as { catchall?: ZodTypeAny }).catchall
      if (catchall) {
        const t = (catchall as { _def?: { typeName?: string } })._def?.typeName
        out.additionalProperties =
          t === 'ZodNever' ? false : convert(catchall, registry, exempt, walking)
      }
      break
    }

    case 'ZodEnum': {
      const values = def.values as unknown[]
      out = { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values }
      break
    }
    case 'ZodNativeEnum': {
      const values = Object.values(def.values as object)
      const allNumeric = values.every((v) => typeof v === 'number')
      out = { type: allNumeric ? 'number' : 'string', enum: values }
      break
    }

    case 'ZodLiteral': {
      const v = def.value
      out = {
        type: (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string') as 'string',
        enum: [v],
      }
      break
    }

    case 'ZodOptional':
      out = convert(def.innerType as ZodTypeAny, registry, exempt, walking)
      break

    case 'ZodNullable': {
      out = convert(def.innerType as ZodTypeAny, registry, exempt, walking)
      out.nullable = true
      break
    }

    case 'ZodDefault': {
      out = convert(def.innerType as ZodTypeAny, registry, exempt, walking)
      try {
        const dv = (def.defaultValue as () => unknown)()
        out.example = dv
      } catch {
        /* ignore */
      }
      break
    }

    case 'ZodUnion': {
      const opts = def.options as ZodTypeAny[]
      out.oneOf = opts.map((o) => convert(o, registry, exempt, walking))
      break
    }
    case 'ZodDiscriminatedUnion': {
      const opts = (def.options as Record<string, ZodTypeAny> | undefined) ?? {}
      out.oneOf = Object.values(opts).map((o) => convert(o, registry, exempt, walking))
      break
    }

    case 'ZodRecord': {
      const valueType = def.valueType as ZodTypeAny
      out = { type: 'object', additionalProperties: convert(valueType, registry, exempt, walking) }
      break
    }

    case 'ZodAny':
    case 'ZodUnknown':
      out = {}
      break

    default:
      out = {}
  }

  // description (Zod .describe())
  if (typeof def.description === 'string' && def.description.length > 0) {
    out.description = def.description
  }

  // example
  if (out.example === undefined) {
    const ex = extractExample(schema)
    if (ex !== undefined) out.example = ex
  }

  return out
}

function refPath(name: string): string {
  return `#/components/schemas/${name}`
}

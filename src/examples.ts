// Extract example values from Zod schemas by walking the tree.
// Handles per-field .default() values, which are the Zod 3 idiom for examples.

import type { ZodTypeAny } from 'zod'

export function extractExample(schema: ZodTypeAny): unknown {
  const def = (schema as { _def?: Record<string, unknown> })._def ?? {}
  const typeName = def.typeName as string | undefined

  // Zod 4 sets def.example directly. Honor it if present.
  if ('example' in def && def.example !== undefined) return def.example

  switch (typeName) {
    case 'ZodObject': {
      const shapeFn = def.shape as () => Record<string, ZodTypeAny>
      const shape = typeof shapeFn === 'function' ? shapeFn() : {}
      const out: Record<string, unknown> = {}
      for (const [key, sub] of Object.entries(shape)) {
        out[key] = extractExample(sub)
      }
      return out
    }
    case 'ZodArray':
      return [extractExample(def.type as ZodTypeAny)]
    case 'ZodOptional':
    case 'ZodNullable':
      return extractExample(def.innerType as ZodTypeAny)
    case 'ZodLazy':
      // Don't peek through lazy — emitting an example for a cycled target yields null example field on $ref.
      return undefined
    case 'ZodDefault': {
      try {
        return (def.defaultValue as () => unknown)()
      } catch {
        return extractExample(def.innerType as ZodTypeAny)
      }
    }
    case 'ZodEnum':
      return (def.values as unknown[])[0]
    case 'ZodNativeEnum': {
      const vals = Object.values(def.values as object)
      return vals.find((v) => typeof v === 'string') ?? vals[0]
    }
    case 'ZodLiteral':
      return def.value
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const opts = (def.options as ZodTypeAny[] | Record<string, ZodTypeAny> | undefined) ?? []
      const first = Array.isArray(opts) ? opts[0] : Object.values(opts)[0]
      return first ? extractExample(first) : undefined
    }
    default:
      return heuristicExample(typeName)
  }
}

function heuristicExample(typeName: string | undefined): unknown {
  switch (typeName) {
    case 'ZodString': return 'string'
    case 'ZodNumber': return 0
    case 'ZodBoolean': return false
    case 'ZodArray': return []
    case 'ZodObject': return {}
    case 'ZodNull': return null
    case 'ZodBigInt': return 0
    case 'ZodDate': return new Date(0).toISOString()
    default: return null
  }
}

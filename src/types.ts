// Shared types — plugin extension surface lives here.

import type { ZodTypeAny } from 'zod'

export interface OpenAPISchema {
  type?: string
  format?: string
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  items?: OpenAPISchema
  enum?: unknown[]
  description?: string
  example?: unknown
  examples?: unknown[]
  nullable?: boolean
  oneOf?: OpenAPISchema[]
  anyOf?: OpenAPISchema[]
  additionalProperties?: boolean | OpenAPISchema
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  $ref?: string
  [k: string]: unknown
}

export interface SchemaInfo {
  name: string
  zod: ZodTypeAny
  file: string
}

/**
 * Plugin hook surface. v1 ships no plugins; future plugins
 * (paths, hono adapter, trpc adapter, etc.) plug in here.
 */
export interface Plugin {
  name: string
  /** Called once per schema after conversion to OpenAPI 3.x. */
  transformSchema?(schema: OpenAPISchema, info: SchemaInfo): OpenAPISchema | Promise<OpenAPISchema>
  /** Called once after all schemas are emitted. Mutate `outputs` to add files. */
  finalize?(ctx: BuildContext): BuildContext | Promise<BuildContext>
}

export interface BuildContext {
  schemas: SchemaInfo[]
  /** path → file contents (relative to out dir) */
  outputs: Map<string, string>
  format: 'yaml' | 'json'
}

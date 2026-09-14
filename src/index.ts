// Programmatic API (for plugin authors).
export { build } from './render.js'
export type { BuildOptions } from './render.js'
export { scanSchemas } from './scanner.js'
export { zodToOpenAPI } from './zod-to-schema.js'
export { extractExample } from './examples.js'
export type { OpenAPISchema, SchemaInfo, Plugin, BuildContext } from './types.js'

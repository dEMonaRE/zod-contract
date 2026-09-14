// Loads Zod schemas from .ts files via jiti.
// Schema discovery: every named export whose value looks like a Zod schema.

import { createJiti } from 'jiti'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ZodTypeAny } from 'zod'
import type { SchemaInfo } from './types.js'

export async function scanSchemas(src: string): Promise<SchemaInfo[]> {
  const abs = path.resolve(src)
  const stat = await fs.stat(abs)
  const files = stat.isDirectory() ? await walkTs(abs) : [abs]
  if (files.length === 0) return []

  const jiti = createJiti(abs, { interopDefault: true, moduleCache: false })
  const seen = new Set<string>()
  const out: SchemaInfo[] = []

  for (const file of files) {
    const mod = jiti(file) as Record<string, unknown>
    for (const [name, value] of Object.entries(mod)) {
      if (!isZodSchema(value)) continue
      const key = `${file}::${name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, zod: value, file })
    }
  }
  return out
}

async function walkTs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      files.push(...(await walkTs(full)))
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      files.push(full)
    }
  }
  return files
}

function isZodSchema(v: unknown): v is ZodTypeAny {
  if (typeof v !== 'object' || v === null) return false
  const def = (v as { _def?: unknown })._def
  if (typeof def !== 'object' || def === null) return false
  const typeName = (def as { typeName?: unknown }).typeName
  return typeof typeName === 'string' && typeName.startsWith('Zod')
}

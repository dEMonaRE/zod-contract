// Loads Zod schemas from .ts files via jiti.
// Schema discovery: every named export whose value looks like a Zod schema.

import { createJiti } from 'jiti'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ZodTypeAny } from 'zod'
import type { SchemaInfo } from './types.js'

export interface ScanOptions {
  /** Glob patterns to exclude (matched against absolute paths). Repeatable. */
  exclude?: string[]
  /** Behavior when two schemas share an export name.
   *  - 'first-wins' (default): keep the first occurrence; stderr note on collision.
   *  - 'merge': same as first-wins today; reserved for future deep-merge support.
   *  - 'error': throw on collision.
   *  Identical _def instances (same reference) are always silent-skip. */
  onCollision?: 'error' | 'merge' | 'first-wins'
}

export async function scanSchemas(src: string, opts: ScanOptions = {}): Promise<SchemaInfo[]> {
  const abs = path.resolve(src)
  const stat = await fs.stat(abs)
  const files = stat.isDirectory() ? await walkTs(abs, opts.exclude ?? []) : [abs]
  if (files.length === 0) return []

  const jiti = createJiti(abs, { interopDefault: true, moduleCache: false })
  const onCollision = opts.onCollision ?? 'first-wins'
  const out: SchemaInfo[] = []
  const nameIndex = new Map<string, SchemaInfo>()

  for (const file of files) {
    const mod = jiti(file) as Record<string, unknown>
    for (const [name, value] of Object.entries(mod)) {
      if (!isZodSchema(value)) continue
      const existing = nameIndex.get(name)
      if (!existing) {
        const info: SchemaInfo = { name, zod: value, file }
        nameIndex.set(name, info)
        out.push(info)
        continue
      }
      // Same instance — silent skip (same module exported twice)
      if (existing.zod === value) continue
      // Real collision
      if (onCollision === 'error') {
        throw new Error(
          `zod-contract: schema name collision for '${name}' from ${existing.file} and ${file}. ` +
            `Rename one, or pass onCollision: 'first-wins' (or 'merge').`,
        )
      }
      if (onCollision === 'merge') {
        const merged = tryMerge(existing.zod, value, name, existing.file, file)
        if (!merged.ok) throw new Error(merged.error)
        const updated: SchemaInfo = { name, zod: merged.schema, file: existing.file }
        nameIndex.set(name, updated)
        const idx = out.indexOf(existing)
        if (idx >= 0) out[idx] = updated
        process.stderr.write(
          `zod-contract: merged '${name}' from ${existing.file} + ${file} (object keys union).\n`,
        )
        continue
      }
      // 'first-wins' — keep first, log the loser
      process.stderr.write(
        `zod-contract: schema name collision for '${name}' (${existing.file} vs ${file}); keeping first.\n`,
      )
    }
  }
  return out
}

async function walkTs(dir: string, exclude: string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  const excluders = exclude.map((g) => globToRegex(g))
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      files.push(...(await walkTs(full, exclude)))
    } else if (
      /\.ts$/.test(e.name) &&
      !/\.test\.ts$/.test(e.name) &&
      !/\.d\.ts$/.test(e.name) &&
      !excluders.some((re) => re.test(full))
    ) {
      files.push(full)
    }
  }
  return files
}

// ponytail: minimal glob → regex. `**` matches any depth (incl. `/`), `*` excludes `/`, `?` matches one char.
// Full picomatch is for v0.4.1 if users need brace/nested patterns.
function globToRegex(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*' && pattern[i + 1] === '*') {
      // ** — match anything including path separators (zero or more chars)
      out += '.*'
      i++ // skip second *
    } else if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else if (c !== undefined && /[.+^$|(){}\[\]\\]/.test(c)) {
      out += '\\' + c
    } else if (c !== undefined) {
      out += c
    }
  }
  return new RegExp('^' + out + '$')
}

function isZodSchema(v: unknown): v is ZodTypeAny {
  if (typeof v !== 'object' || v === null) return false
  const def = (v as { _def?: unknown })._def
  if (typeof def !== 'object' || def === null) return false
  const typeName = (def as { typeName?: unknown }).typeName
  return typeof typeName === 'string' && typeName.startsWith('Zod')
}

// ponytail: only ZodObject supports deep-merge in v0.4. For other types, surface a clear
// error pointing the user at rename or a different onCollision mode. Zod's `.merge()` is
// last-wins per key, matches convention for "extensions".
function tryMerge(
  a: ZodTypeAny,
  b: ZodTypeAny,
  name: string,
  fileA: string,
  fileB: string,
): { ok: true; schema: ZodTypeAny } | { ok: false; error: string } {
  const tA = (a._def as { typeName?: string }).typeName
  const tB = (b._def as { typeName?: string }).typeName
  if (tA !== 'ZodObject' || tB !== 'ZodObject') {
    return {
      ok: false,
      error:
        `zod-contract: cannot merge '${name}' — only ZodObject schemas are mergeable. ` +
        `Got ${tA} (${fileA}) vs ${tB} (${fileB}). ` +
        `Rename one, or pass onCollision: 'first-wins'|'error'.`,
    }
  }
  const merged = (a as unknown as { merge: (other: ZodTypeAny) => ZodTypeAny }).merge(b)
  return { ok: true, schema: merged }
}

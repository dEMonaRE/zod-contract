import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { build } from '../src/render.js'

let tmp: string
let out: string

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures')

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zc-watch-'))
  out = path.join(tmp, 'out')
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('format flag', () => {
  it('emits .yaml by default', async () => {
    const ctx = await build({ src: fixturesDir, out })
    const yamlFiles = [...ctx.outputs.keys()].filter((k) => k.endsWith('.yaml'))
    expect(yamlFiles.length).toBeGreaterThan(0)
  })

  it('emits .json when format=json', async () => {
    const ctx = await build({ src: fixturesDir, out, format: 'json' })
    const schemaFiles = [...ctx.outputs.keys()].filter(
      (k) => k.startsWith('components/schemas/') && k.endsWith('.json'),
    )
    expect(schemaFiles.length).toBeGreaterThan(0)
    // examples are always JSON
    expect([...ctx.outputs.keys()].some((k) => k.startsWith('examples/'))).toBe(true)
  })

  it('format=json still produces valid JSON', async () => {
    const ctx = await build({ src: fixturesDir, out, format: 'json' })
    const userFile = [...ctx.outputs.keys()].find((k) => k.endsWith('User.json'))!
    const parsed = JSON.parse(ctx.outputs.get(userFile)!)
    expect(parsed.User).toBeTruthy()
    expect(parsed.User.properties).toBeTruthy()
  })

  it('writes index.json when format=json', async () => {
    const ctx = await build({ src: fixturesDir, out, format: 'json' })
    expect(ctx.outputs.has('index.json')).toBe(true)
    const idx = JSON.parse(ctx.outputs.get('index.json')!)
    expect(idx.openapi).toBe('3.2.0')
  })

  it('defaults to OpenAPI 3.2.0', async () => {
    const ctx = await build({ src: fixturesDir, out })
    const idx = ctx.outputs.get('index.yaml')!
    expect(idx).toContain('openapi: 3.2.0')
  })

  it('honors --openapi-version 3.1.0', async () => {
    const ctx = await build({ src: fixturesDir, out, openapiVersion: '3.1.0' })
    const idx = ctx.outputs.get('index.yaml')!
    expect(idx).toContain('openapi: 3.1.0')
    expect(idx).not.toContain('openapi: 3.2.0')
  })
})

describe('BuildContext.format', () => {
  it('propagates to plugins via finalize', async () => {
    let seen: string | undefined
    await build({
      src: fixturesDir,
      out,
      plugins: [
        {
          name: 'probe',
          finalize(ctx) {
            seen = ctx.format
            return ctx
          },
        },
      ],
    })
    expect(seen).toBe('yaml')
  })
})

describe('chokidar integration', () => {
  it('detects file changes in a watched dir', async () => {
    const watchSrc = path.join(tmp, 'watch-src')
    await fs.mkdir(watchSrc, { recursive: true })
    await fs.writeFile(
      path.join(watchSrc, 'a.ts'),
      `import { z } from 'zod'\nexport const A = z.object({ a: z.string() })`,
    )

    const chokidar = (await import('chokidar')).default
    const watcher = chokidar.watch(watchSrc, { ignoreInitial: true })

    // Wait for watcher ready BEFORE writing (chokidar emits 'ready')
    await new Promise<void>((resolve) => {
      watcher.once('ready', () => resolve())
    })

    let changed = false
    watcher.on('all', () => {
      changed = true
    })

    await fs.writeFile(
      path.join(watchSrc, 'b.ts'),
      `import { z } from 'zod'\nexport const B = z.object({ b: z.string() })`,
    )

    // Wait briefly for the FS event to bubble
    await new Promise((r) => setTimeout(r, 200))

    await watcher.close()
    expect(changed).toBe(true)
  })
})

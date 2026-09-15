import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { build, scanSchemas } from '../src/index.js'

async function tmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zod-contract-exc-'))
}

describe('Tier 1 #4 + #5: --exclude and collision modes', () => {
  it('--exclude skips files matching glob', async () => {
    const out = await tmp()
    const ctx = await build({
      src: path.resolve('fixtures'),
      out,
      exclude: ['**/user-order.ts'],
    })
    const names = ctx.schemas.map((s) => s.name)
    // Item only exists in user-order.ts → must vanish
    expect(names).not.toContain('Item')
  })

  it('onCollision=error throws on duplicates across files', async () => {
    const out = await tmp()
    await expect(
      build({ src: path.resolve('fixtures'), out, onCollision: 'error' }),
    ).rejects.toThrow(/collision/i)
  })

  it('onCollision=first-wins (default) keeps the first occurrence', async () => {
    const out = await tmp()
    const ctx = await build({ src: path.resolve('fixtures'), out })
    const user = ctx.schemas.find((s) => s.name === 'User')
    expect(user).toBeDefined()
    // alphabetical traversal: bidirectional.ts < user-order.ts < user.ts
    // User export is in bidirectional.ts and user.ts; first wins = bidirectional.ts.
    expect(user!.file.endsWith('bidirectional.ts')).toBe(true)
  })

  it('scanSchemas takes exclude options directly', async () => {
    const schemas = await scanSchemas(path.resolve('fixtures'), {
      exclude: ['**/user-order.ts'],
    })
    expect(schemas.map((s) => s.name)).not.toContain('Item')
  })
})

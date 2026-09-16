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

  it('onCollision=merge combines ZodObject shapes (last-wins per key)', async () => {
    const schemas = await scanSchemas(path.resolve('fixtures'), { onCollision: 'merge' })
    const user = schemas.find((s) => s.name === 'User')
    expect(user).toBeDefined()
    // Merged schema is still a ZodObject (union of keys from all 3 files).
    expect((user!.zod._def as { typeName?: string }).typeName).toBe('ZodObject')
    const shape = (user!.zod._def as { shape: () => Record<string, unknown> }).shape()
    // Union of every key from bidirectional, user-order, and user fixtures.
    expect(Object.keys(shape).sort()).toEqual(
      ['address', 'createdAt', 'email', 'home', 'id', 'name', 'role'].sort(),
    )
    // Sanity: only the leaf fields (skip the recursive home chain).
    const parsed = (user!.zod as unknown as { partial: () => { parse: (o: unknown) => unknown } })
      .partial()
      .parse({
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        email: 'a@b.co',
        name: 'Ada',
        role: 'admin',
        createdAt: '2026-01-15T08:30:00Z',
      })
    expect((parsed as { email: string }).email).toBe('a@b.co')
  })
})

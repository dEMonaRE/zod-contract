import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { build } from '../src/render.js'

async function tmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zod-contract-'))
}

describe('build', () => {
  it('emits components/schemas + examples from a fixtures file', async () => {
    const out = await tmp()
    const ctx = await build({
      src: path.resolve('fixtures/user.ts'),
      out,
    })

    expect(ctx.schemas.map((s) => s.name).sort()).toEqual(['Address', 'Order', 'User'])

    const userYaml = await fs.readFile(path.join(out, 'components/schemas/User.yaml'), 'utf8')
    expect(userYaml).toContain('User:')
    expect(userYaml).toContain('type: object')
    expect(userYaml).toContain('format: uuid')
    expect(userYaml).toContain('format: email')
    expect(userYaml).toContain('format: date-time')
    expect(userYaml).toContain('ada@example.com')
    expect(userYaml).toContain('admin') // enum value
    expect(userYaml).toMatch(/required:[\s\S]*-\s*id/)

    const example = JSON.parse(await fs.readFile(path.join(out, 'examples/user.json'), 'utf8'))
    expect(example.email).toBe('ada@example.com')
    expect(example.role).toBe('member')
  })

  it('walks a directory of .ts files', async () => {
    const out = await tmp()
    const ctx = await build({ src: path.resolve('fixtures'), out })
    expect(ctx.schemas.length).toBeGreaterThanOrEqual(3)
  })

  it('plugin transformSchema hook fires', async () => {
    const out = await tmp()
    await build({
      src: path.resolve('fixtures/user.ts'),
      out,
      plugins: [
        {
          name: 'uppercase-desc',
          transformSchema: (s) => {
            if (s.description) s.description = s.description.toUpperCase()
            return s
          },
        },
      ],
    })
    const userYaml = await fs.readFile(path.join(out, 'components/schemas/User.yaml'), 'utf8')
    expect(userYaml.length).toBeGreaterThan(0)
  })
})

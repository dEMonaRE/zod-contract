import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

function run(args: string[], cwd: string) {
  const cli = path.resolve('dist/cli.js')
  return spawnSync('node', [cli, ...args], { cwd, encoding: 'utf8' })
}

async function tmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zod-contract-init-'))
}

describe('zod-contract init', () => {
  it('scaffolds src/schemas/User.ts and prints next command', async () => {
    const dir = await tmp()
    const r = run(['init'], dir)
    expect(r.status).toBe(0)
    const sample = path.join(dir, 'src/schemas/User.ts')
    const exists = await fs.stat(sample).then(() => true).catch(() => false)
    expect(exists).toBe(true)
    const content = await fs.readFile(sample, 'utf8')
    expect(content).toContain('export const User')
    expect(content).toContain("from 'zod'")
    expect(r.stdout).toContain('Next:')
    expect(r.stdout).toContain('zod-contract build src/schemas api')
  })

  it('is idempotent — second run skips User.ts', async () => {
    const dir = await tmp()
    const first = run(['init'], dir)
    expect(first.status).toBe(0)
    const original = await fs.readFile(path.join(dir, 'src/schemas/User.ts'), 'utf8')
    await fs.writeFile(path.join(dir, 'src/schemas/User.ts'), '// user content\n')
    const second = run(['init'], dir)
    expect(second.status).toBe(0)
    expect(second.stdout).toContain('already exists, skipped')
    const after = await fs.readFile(path.join(dir, 'src/schemas/User.ts'), 'utf8')
    expect(after).toBe('// user content\n') // untouched
    expect(original).toContain('export const User')
  })

  it('--with-package-scripts adds scripts to package.json (no overwrite)', async () => {
    const dir = await tmp()
    const pkg = {
      name: 'demo',
      version: '0.0.0',
      scripts: { 'zod-contract:build': 'preset-command' },
    }
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    const r = run(['init', '--with-package-scripts'], dir)
    expect(r.status).toBe(0)
    const after = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'))
    expect(after.scripts['zod-contract:build']).toBe('preset-command') // preserved
    expect(after.scripts['zod-contract:watch']).toBe('zod-contract watch src/schemas api')
  })

  it('--with-package-scripts is a no-op when no package.json exists', async () => {
    const dir = await tmp()
    const r = run(['init', '--with-package-scripts'], dir)
    expect(r.status).toBe(0)
    const pkgExists = await fs.stat(path.join(dir, 'package.json')).then(() => true).catch(() => false)
    expect(pkgExists).toBe(false)
    // Sample still created
    expect(r.stdout).toContain('+ created')
  })
})

#!/usr/bin/env node
import { Command } from 'commander'
import chokidar from 'chokidar'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { build } from './render.js'

const program = new Command()
program
  .name('zod-contract')
  .description('Zod schemas → OpenAPI 3.x components + JSON examples. Zero wrapping, zero config.')
  .version('0.1.0')

program
  .command('build')
  .description('Build OpenAPI components and examples from Zod schemas')
  .argument('<src>', 'Source directory or single .ts file with Zod schema exports')
  .argument('<out>', 'Output directory')
  .option('-f, --format <format>', 'Output format for schemas (yaml|json)', 'yaml')
  .option('-v, --openapi-version <ver>', 'OpenAPI version (3.1.0|3.2.0)', '3.2.0')
  .option('-e, --exclude <patterns...>', 'Glob patterns to exclude (repeatable)', [])
  .option('-c, --on-collision <mode>', 'Schema name collision mode (error|merge|first-wins)', 'first-wins')
  .action(async (src: string, out: string, opts: { format: string; openapiVersion: string; exclude: string[]; onCollision: string }) => {
    const ctx = await build({
      src,
      out,
      format: opts.format as 'yaml' | 'json',
      openapiVersion: opts.openapiVersion as '3.1.0' | '3.2.0',
      exclude: opts.exclude,
      onCollision: opts.onCollision as 'error' | 'merge' | 'first-wins',
    })
    const count = ctx.schemas.length
    const files = ctx.outputs.size
    process.stdout.write(`✓ ${count} schema${count === 1 ? '' : 's'} → ${files} file${files === 1 ? '' : 's'} in ${out}\n`)
  })

program
  .command('watch')
  .description('Watch source and rebuild on change')
  .argument('<src>', 'Source directory or single .ts file with Zod schema exports')
  .argument('<out>', 'Output directory')
  .option('-f, --format <format>', 'Output format for schemas (yaml|json)', 'yaml')
  .option('-v, --openapi-version <ver>', 'OpenAPI version (3.1.0|3.2.0)', '3.2.0')
  .option('-d, --debounce <ms>', 'Rebuild debounce in ms', '200')
  .option('-e, --exclude <patterns...>', 'Glob patterns to exclude (repeatable)', [])
  .option('-c, --on-collision <mode>', 'Schema name collision mode (error|merge|first-wins)', 'first-wins')
  .action(async (src: string, out: string, opts: { format: string; openapiVersion: string; debounce: string; exclude: string[]; onCollision: string }) => {
    const format = opts.format as 'yaml' | 'json'
    const openapiVersion = opts.openapiVersion as '3.1.0' | '3.2.0'
    const debounceMs = parseInt(opts.debounce, 10)
    const exclude = opts.exclude
    const onCollision = opts.onCollision as 'error' | 'merge' | 'first-wins'

    // Initial build
    try {
      const ctx = await build({ src, out, format, openapiVersion, exclude, onCollision })
      process.stdout.write(`✓ initial: ${ctx.schemas.length} schemas → ${ctx.outputs.size} files in ${out}\n`)
    } catch (e) {
      process.stderr.write(`✗ initial build failed: ${(e as Error).message}\n`)
    }

    const watcher = chokidar.watch(src, {
      ignored: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
    })

    let timer: NodeJS.Timeout | null = null
    let building = false

    watcher.on('all', (event, filePath) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        if (building) return
        building = true
        const t0 = Date.now()
        try {
          const ctx = await build({ src, out, format, exclude, onCollision })
          const ms = Date.now() - t0
          process.stdout.write(
            `[${new Date().toLocaleTimeString()}] ${event} ${filePath} → ${ctx.schemas.length} schemas (${ms}ms)\n`,
          )
        } catch (e) {
          process.stderr.write(
            `[${new Date().toLocaleTimeString()}] ${event} ${filePath} → error: ${(e as Error).message}\n`,
          )
        } finally {
          building = false
        }
      }, debounceMs)
    })

    const shutdown = async () => {
      if (timer) clearTimeout(timer)
      await watcher.close()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

program
  .command('init')
  .description('Scaffold a starter Zod schema file (idempotent — skips files that exist)')
  .argument('[dir]', 'Project directory to scaffold into', '.')
  .option('--with-package-scripts', 'Add zod-contract build/watch scripts to package.json', false)
  .action(async (dir: string, opts: { withPackageScripts: boolean }) => {
    const root = path.resolve(dir)
    const schemasDir = path.join(root, 'src', 'schemas')
    await fs.mkdir(schemasDir, { recursive: true })

    const sampleFile = path.join(schemasDir, 'User.ts')
    const sampleWritten = await writeIfMissing(
      sampleFile,
      `import { z } from 'zod'

export const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(['admin', 'member', 'guest']).default('member'),
})
`,
    )

    let pkgTouched = false
    if (opts.withPackageScripts) {
      const pkgPath = path.join(root, 'package.json')
      try {
        const raw = await fs.readFile(pkgPath, 'utf8')
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
        pkg.scripts = pkg.scripts ?? {}
        if (!pkg.scripts['zod-contract:build']) {
          pkg.scripts['zod-contract:build'] = 'zod-contract build src/schemas api'
          pkgTouched = true
        }
        if (!pkg.scripts['zod-contract:watch']) {
          pkg.scripts['zod-contract:watch'] = 'zod-contract watch src/schemas api'
          pkgTouched = true
        }
        if (pkgTouched) await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      } catch {
        // no package.json — skip silently
      }
    }

    process.stdout.write(
      [
        sampleWritten
          ? `+ created ${path.relative(root, sampleFile)}`
          : `= ${path.relative(root, sampleFile)} already exists, skipped`,
        pkgTouched ? '+ updated package.json scripts (zod-contract:build, zod-contract:watch)' : null,
        '',
        'Next:',
        '  npx zod-contract build src/schemas api   # emit api/components/schemas.yaml + examples',
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  })

async function writeIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return false
  } catch {
    await fs.writeFile(filePath, content)
    return true
  }
}

await program.parseAsync()

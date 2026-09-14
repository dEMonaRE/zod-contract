#!/usr/bin/env node
import { Command } from 'commander'
import chokidar from 'chokidar'
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
  .action(async (src: string, out: string, opts: { format: string; openapiVersion: string }) => {
    const ctx = await build({
      src,
      out,
      format: opts.format as 'yaml' | 'json',
      openapiVersion: opts.openapiVersion as '3.1.0' | '3.2.0',
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
  .action(async (src: string, out: string, opts: { format: string; openapiVersion: string; debounce: string }) => {
    const format = opts.format as 'yaml' | 'json'
    const openapiVersion = opts.openapiVersion as '3.1.0' | '3.2.0'
    const debounceMs = parseInt(opts.debounce, 10)

    // Initial build
    try {
      const ctx = await build({ src, out, format, openapiVersion })
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
          const ctx = await build({ src, out, format })
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

await program.parseAsync()

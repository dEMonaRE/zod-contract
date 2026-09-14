import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanSchemas } from '../src/scanner.js'
import { zodToOpenAPI } from '../src/zod-to-schema.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(here, '../fixtures')

describe('bidirectional refs via z.lazy()', () => {
  it('emits $ref on both sides when two schemas reference each other', async () => {
    const schemas = await scanSchemas(path.join(fixtures, 'bidirectional.ts'))
    expect(schemas.map((s) => s.name).sort()).toEqual(['Address', 'User'])

    const registry = new Map(schemas.map((s) => [s.zod, s.name] as const))
    const user = zodToOpenAPI(schemas.find((s) => s.name === 'User')!, registry)
    const address = zodToOpenAPI(schemas.find((s) => s.name === 'Address')!, registry)

    expect(user.properties!.home).toMatchObject({ $ref: '#/components/schemas/Address' })
    expect(address.properties!.occupant).toMatchObject({ $ref: '#/components/schemas/User' })
    expect(user.required).toEqual(expect.arrayContaining(['name', 'home']))
    expect(address.required).toEqual(expect.arrayContaining(['city', 'occupant']))
  })
})

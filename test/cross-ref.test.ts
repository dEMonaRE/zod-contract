import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as YAML from 'yaml'
import { build } from '../src/render.js'

async function tmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zod-contract-xref-'))
}

describe('cross-schema $ref', () => {
  it('emits $ref for cross-schema references', async () => {
    const out = await tmp()
    const ctx = await build({ src: path.resolve('fixtures/user-order.ts'), out })

    expect(ctx.schemas.map((s) => s.name).sort()).toEqual(['Address', 'Item', 'Order', 'User'])

    const orderYaml = await fs.readFile(path.join(out, 'components/schemas/Order.yaml'), 'utf8')
    const order = YAML.parse(orderYaml) as Record<string, { properties: Record<string, Record<string, unknown>> }>

    // Order.user → $ref: User (no inline properties)
    expect(order.Order.properties.user).toEqual({ $ref: '#/components/schemas/User' })

    // Order.shippingAddress → $ref: Address with nullable: true + Address example
    expect(order.Order.properties.shippingAddress).toEqual({
      $ref: '#/components/schemas/Address',
      example: { city: 'Cupertino', country: 'US', street: '1 Infinite Loop' },
      nullable: true,
    })

    // Order.items → array of $ref: Item (with example from Item defaults)
    expect(order.Order.properties.items).toEqual({
      type: 'array',
      example: [{ name: 'Widget', qty: 1, sku: 'SKU-001' }],
      items: { $ref: '#/components/schemas/Item' },
    })

    // Order's properties should NOT contain inline User/Address/Item content
    const userInline = JSON.stringify(order.Order.properties).includes('format: uuid')
    expect(userInline).toBe(false)
  })

  it('handles nullable vs optional in required array', async () => {
    const out = await tmp()
    await build({ src: path.resolve('fixtures/user-order.ts'), out })

    const orderYaml = await fs.readFile(path.join(out, 'components/schemas/Order.yaml'), 'utf8')
    const order = YAML.parse(orderYaml) as Record<string, { required: string[] }>

    // OpenAPI 3.1: nullable=true does NOT remove from required — value must still be present (can be null).
    // Only ZodOptional drops a field from required. ZodNullable keeps it required.
    expect(order.Order.required).toContain('shippingAddress')
    expect(order.Order.required).toContain('user')
  })

  it('inlines top-level schema itself (no self-ref)', async () => {
    const out = await tmp()
    await build({ src: path.resolve('fixtures/user-order.ts'), out })

    const userYaml = await fs.readFile(path.join(out, 'components/schemas/User.yaml'), 'utf8')
    expect(userYaml).toMatch(/^User:\n  type: object/)
    expect(userYaml).not.toContain('$ref: #/components/schemas/User')
  })

  it('components/schemas files reference each other cleanly', async () => {
    const out = await tmp()
    await build({ src: path.resolve('fixtures/user-order.ts'), out })

    const indexYaml = await fs.readFile(path.join(out, 'index.yaml'), 'utf8')
    expect(indexYaml).toContain('User:')
    expect(indexYaml).toContain('Address:')
    expect(indexYaml).toContain('Item:')
    expect(indexYaml).toContain('Order:')
  })
})

// Cross-schema reference fixture.
// Linear declaration order so no forward references: Item → Address → User → Order.
// Bidirectional refs (User↔Address) need z.lazy() which the skeleton doesn't support.
import { z } from 'zod'

export const Item = z.object({
  sku: z.string().default('SKU-001'),
  name: z.string().default('Widget'),
  qty: z.number().int().min(1).default(1),
})

export const Address = z.object({
  street: z.string().default('1 Infinite Loop'),
  city: z.string().default('Cupertino'),
  country: z.string().length(2).default('US'),
})

export const User = z.object({
  id: z.string().uuid().default('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
  email: z.string().email().default('ada@example.com'),
  name: z.string().default('Ada Lovelace'),
  address: Address,
})

export const Order = z.object({
  id: z.string().uuid(),
  user: User,
  shippingAddress: Address.nullable(),
  items: z.array(Item),
  total: z.number().int().min(0).default(0),
})

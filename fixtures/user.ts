// Sample fixture — used by the demo and the smoke test.
// Example values come from .default() in Zod 3 (Zod 4 has .example()).
import { z } from 'zod'

export const User = z.object({
  id: z.string().uuid().default('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
  email: z.string().email().default('ada@example.com'),
  name: z.string().min(1).max(120).default('Ada Lovelace'),
  role: z.enum(['admin', 'member', 'guest']).default('member'),
  createdAt: z.string().datetime().default('2026-01-15T08:30:00Z'),
})

export const Address = z.object({
  street: z.string().default('1 Infinite Loop'),
  city: z.string().default('Cupertino'),
  country: z.string().length(2).default('US'),
})

export const Order = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  total: z.number().int().min(0).default(1999),
  currency: z.enum(['USD', 'EUR', 'TRY']).default('USD'),
  notes: z.string().optional(),
})

// Bidirectional refs via z.lazy(): User → Address → User.
// `z.lazy()` is required on one side to defer evaluation and avoid TDZ.
import { z } from 'zod'

interface User {
  name: string
  home: Address
}

interface Address {
  city: string
  occupant: User
}

export const User: z.ZodType<User> = z.object({
  name: z.string(),
  home: z.lazy(() => Address),
})

export const Address: z.ZodType<Address> = z.object({
  city: z.string(),
  occupant: z.lazy(() => User),
})

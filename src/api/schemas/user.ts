import { z } from 'zod';

/**
 * Пример схемы ответа. Замените поля под реальный контракт.
 */
export const userSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string().min(1),
});

export type User = z.infer<typeof userSchema>;

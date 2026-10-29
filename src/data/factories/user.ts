import { randomUUID } from 'node:crypto';

export type TestUser = {
  email: string;
  password: string;
  name: string;
};

/**
 * Фабрика синтетического пользователя.
 * Уникальность обеспечивается коротким UUID на каждый вызов.
 */
export function buildTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = randomUUID().slice(0, 8);

  return {
    email: `qa+${id}@example.com`,
    password: `Qa!${id}${id}`,
    name: `QA ${id}`,
    ...overrides,
  };
}

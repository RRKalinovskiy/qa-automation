import type { Page } from '@playwright/test';

/**
 * Базовая страница. Наследуйтесь от неё для каждой страницы приложения:
 * локаторы и действия живут в наследниках, тесты — только вызывают методы.
 */
export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  async open(path = '/'): Promise<void> {
    await this.page.goto(path);
  }
}

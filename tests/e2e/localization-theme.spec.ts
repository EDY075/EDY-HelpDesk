import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error('DEMO_SEED_PASSWORD is required by the isolated E2E seed.');

async function signIn(page: Page, language: 'pt-BR' | 'en' = 'pt-BR') {
  await page.goto('/login');
  await page.getByLabel(/Idioma|Language/u).selectOption(language);
  await page.getByLabel(language === 'pt-BR' ? 'Nome de usuário' : 'Username').fill('demo.admin');
  await page.getByRole('textbox', { name: language === 'pt-BR' ? /Senha/u : /Password/u }).fill(password);
  await page.getByRole('button', { name: language === 'pt-BR' ? 'Entrar no ambiente' : 'Enter workspace' }).click();
  await expect(page).toHaveURL(/\/overview$/u);
}

test.describe('Localization and theme preferences', () => {
  test('pt-BR is the initial language and English persists after reload', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('translate', 'no');
    await expect(page.locator('meta[name="google"]')).toHaveAttribute('content', 'notranslate');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

    await page.getByLabel('Idioma').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Language')).toHaveValue('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('authenticated language choice persists in Settings', async ({ page }) => {
    await signIn(page, 'en');
    await page.goto('/settings');
    await page.getByLabel('Language').selectOption('pt-BR');
    await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await page.reload();
    await expect(page.getByLabel('Idioma')).toHaveValue('pt-BR');
    await expect(page.getByRole('heading', { name: 'Aparência' })).toBeVisible();
  });

  test('Dark and Operations themes persist after reload', async ({ page }) => {
    await signIn(page, 'en');
    await page.goto('/settings');
    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByLabel('Theme')).toHaveValue('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByLabel('Theme').selectOption('operations');
    await page.reload();
    await expect(page.getByLabel('Theme')).toHaveValue('operations');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operations');
  });

  test('pt-BR and Dark survive reload together', async ({ page }) => {
    await signIn(page, 'pt-BR');
    await page.goto('/settings');
    await page.getByLabel('Tema').selectOption('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Idioma')).toHaveValue('pt-BR');
    await expect(page.getByLabel('Tema')).toHaveValue('dark');
  });

  test('English and Operations survive reload together', async ({ page }) => {
    await signIn(page, 'en');
    await page.goto('/settings');
    await page.getByLabel('Theme').selectOption('operations');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operations');
    await expect(page.getByLabel('Language')).toHaveValue('en');
    await expect(page.getByLabel('Theme')).toHaveValue('operations');
  });
});

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
];

const combinations = [
  { language: 'pt-BR' as const, theme: 'operations' as const },
  { language: 'pt-BR' as const, theme: 'dark' as const },
  { language: 'en' as const, theme: 'operations' as const },
  { language: 'en' as const, theme: 'dark' as const },
];

for (const combination of combinations) {
  for (const viewport of viewports) {
    test(`localized responsive matrix ${combination.language} + ${combination.theme} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signIn(page, combination.language);
      await page.goto('/settings');
      await page.getByLabel(combination.language === 'pt-BR' ? 'Tema' : 'Theme').selectOption(combination.theme);

      const asset = (await (await page.request.get('/api/v1/assets?page=1&pageSize=1')).json()).data[0] as { id: string };
      const ticket = (await (await page.request.get('/api/v1/tickets?page=1&pageSize=1')).json()).data[0] as { id: string };
      const securityCase = (await (await page.request.get('/api/v1/security/cases?page=1&pageSize=1')).json()).data[0] as { id: string };
      const routes = [
        '/overview',
        '/operations',
        '/tickets',
        `/tickets/${ticket.id}`,
        `/assets/${asset.id}`,
        `/assets/${asset.id}/diagnostics`,
        `/security/cases/${securityCase.id}`,
        '/reports',
        '/settings',
      ];

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main#main-content')).toBeVisible();
        const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
        expect(overflow, `page-level horizontal overflow at ${route}`).toBeLessThanOrEqual(1);
        await expect(page.locator('html')).toHaveAttribute('lang', combination.language);
        await expect(page.locator('html')).toHaveAttribute('data-theme', combination.theme);
      }

      await page.keyboard.press('Control+K');
      await expect(page.getByRole('dialog', { name: combination.language === 'pt-BR' ? 'Paleta de comandos' : 'Command palette' })).toBeVisible();
      const paletteOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      expect(paletteOverflow).toBeLessThanOrEqual(1);
    });
  }
}

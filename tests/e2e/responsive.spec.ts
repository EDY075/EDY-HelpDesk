import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error('DEMO_SEED_PASSWORD is required by the isolated E2E seed.');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/Idioma|Language/u).selectOption('en');
  await page.getByLabel('Username').fill('demo.admin');
  await page.getByRole('textbox', { name: /Password/u }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await expect(page).toHaveURL(/\/overview$/u);
}

const viewports = [
  { width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 900 },
];

for (const viewport of viewports) {
  test(`responsive route matrix ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    const loginOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(loginOverflow, 'page-level horizontal overflow at /login').toBeLessThanOrEqual(1);
    await login(page);
    const assetResponse = await page.request.get('/api/v1/assets?page=1&pageSize=1');
    const ticketResponse = await page.request.get('/api/v1/tickets?page=1&pageSize=1');
    const articleResponse = await page.request.get('/api/v1/knowledge?page=1&pageSize=1');
    const caseResponse = await page.request.get('/api/v1/security/cases?page=1&pageSize=1');
    const userResponse = await page.request.get('/api/v1/users?page=1&pageSize=1');
    const asset = (await assetResponse.json()).data[0] as { id: string };
    const ticket = (await ticketResponse.json()).data[0] as { id: string };
    const article = (await articleResponse.json()).data[0] as { id: string };
    const securityCase = (await caseResponse.json()).data[0] as { id: string };
    const user = (await userResponse.json()).data[0] as { id: string };
    const routes = ['/overview','/operations','/tickets','/tickets/new',`/tickets/${ticket.id}`,'/users',`/users/${user.id}`,'/assets',`/assets/${asset.id}`,`/assets/${asset.id}/diagnostics`,`/assets/${asset.id}/diagnostics?action=eventlog.query`,'/knowledge',`/knowledge/${article.id}`,'/security','/security/cases',`/security/cases/${securityCase.id}`,'/reports','/reports#recent-reports','/integrations','/settings'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main#main-content')).toBeVisible();
      await expect.poll(() => page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }))).toEqual(expect.objectContaining({ document: expect.any(Number), viewport: viewport.width }));
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      expect(overflow, `page-level horizontal overflow at ${route}`).toBeLessThanOrEqual(1);
    }
    await page.keyboard.press('Control+K');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    const paletteOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(paletteOverflow).toBeLessThanOrEqual(1);
  });
}

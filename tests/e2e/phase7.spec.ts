import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error('DEMO_SEED_PASSWORD is required by the isolated E2E seed.');

async function login(page: Page, username = 'demo.admin') {
  await page.goto('/login');
  await page.getByLabel(/Idioma|Language/u).selectOption('en');
  await page.getByLabel('Username').fill(username);
  await page.getByRole('textbox', { name: /Password/u }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.getByRole('heading', { name: 'Service desk pulse' })).toBeVisible();
}

function observeFailures(page: Page) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
  return () => { expect(consoleErrors, 'unexpected browser console errors').toEqual([]); expect(serverErrors, 'unexpected 5xx responses').toEqual([]); };
}

let assetUrl = '';
let ticketUrl = '';
let securityCaseUrl = '';

test.describe.serial('EDY HelpDesk v1 end-to-end workflows', () => {
  test('login and server-side logout', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.getByRole('button', { name: /Account menu/u }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await page.goto('/overview');
    await expect(page).toHaveURL(/\/login$/u);
    verify();
  });

  test('Viewer is read-only and cannot reach mutation controls', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page, 'demo.viewer');
    await expect(page.getByRole('link', { name: 'New ticket' })).toHaveCount(0);
    await page.goto('/tickets/new');
    await expect(page.getByRole('heading', { name: 'Read-only access' })).toBeVisible();
    await page.goto('/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create local export' })).toHaveCount(0);
    verify();
  });

  test('Technician cannot use Admin-only integration export', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page, 'demo.technician');
    await page.goto('/integrations');
    await expect(page.getByText('Incompatible', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create local export' })).toHaveCount(0);
    verify();
  });

  test('Admin creates and assigns an asset, then opens Endpoint 360', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.goto('/assets');
    await page.getByRole('button', { name: 'Register asset' }).click();
    const editor = page.locator('form.record-editor');
    const name = `Synthetic E2E Endpoint ${Date.now()}`;
    await editor.getByLabel('Asset name').fill(name);
    await editor.locator('select[name="departmentId"]').selectOption({ index: 1 });
    await editor.getByLabel('Operating system').fill('Windows 11 E2E');
    await page.getByRole('button', { name: 'Save asset' }).click();
    await page.getByLabel('Search assets').fill(name);
    await page.getByRole('link', { name: new RegExp(name, 'u') }).click();
    assetUrl = page.url();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByLabel('Assigned user').selectOption({ index: 1 });
    await expect(page.getByText('Endpoint health')).toBeVisible();
    await page.getByRole('link', { name: 'Diagnostic workspace' }).click();
    await expect(page.getByText('Live diagnostics disabled in Portfolio Demo.')).toBeVisible();
    verify();
  });

  test('ticket lifecycle includes assignment, asset, knowledge, internal note and resolution', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.goto('/tickets/new');
    const ticketForm = page.locator('form.editor-layout');
    const summary = `Synthetic E2E ticket ${Date.now()}`;
    await page.getByLabel('Summary').fill(summary);
    await page.getByLabel('Description').fill('Synthetic deterministic E2E workflow without private endpoint data.');
    await ticketForm.locator('select[name="requesterId"]').selectOption({ index: 1 });
    await ticketForm.locator('select[name="categoryId"]').selectOption({ index: 1 });
    await ticketForm.locator('select[name="assetId"]').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Create ticket' }).click();
    await expect(page.getByRole('heading', { name: summary })).toBeVisible();
    ticketUrl = page.url();
    await page.getByRole('button', { name: 'Assign ticket' }).click();
    await expect(page.getByText('Ticket assigned.')).toBeVisible();
    await page.getByLabel('Next status').selectOption('InProgress');
    await page.getByRole('button', { name: 'Change status' }).click();
    await expect(page.getByText('Status changed to In Progress.')).toBeVisible();
    await page.getByLabel('Related asset selection').selectOption({ index: 2 });
    await page.getByPlaceholder('Search code, title, or symptom…').fill('network');
    const articleSelect = page.getByLabel('Link article');
    await expect(articleSelect.locator('option')).not.toHaveCount(1);
    await articleSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Internal' }).click();
    await page.getByPlaceholder('Add an internal note visible to technicians…').fill('Synthetic internal note for deterministic E2E validation.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText('Internal note added.')).toBeVisible();
    await page.getByLabel('Next status').selectOption('Resolved');
    await page.getByRole('textbox', { name: 'Solution', exact: true }).fill('Validated the safe synthetic support procedure.');
    await page.getByRole('button', { name: 'Change status' }).click();
    await expect(page.getByText('Status changed to Resolved.')).toBeVisible();
    verify();
  });

  test('security escalation, evidence and resolution stay inside the governed workflow', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.goto(ticketUrl);
    await page.getByRole('button', { name: 'Escalate to Security' }).click();
    await page.getByLabel('Reason').fill('Synthetic security review requested by E2E.');
    await page.getByLabel('Severity').selectOption('High');
    await page.getByLabel('Security summary').fill('Sanitized synthetic context only.');
    await page.getByRole('button', { name: 'Create Security Case' }).click();
    await expect(page.getByText('Ticket escalated to Security.')).toBeVisible();
    await page.getByRole('link', { name: 'Open Security Case' }).click();
    securityCaseUrl = page.url();
    await page.getByRole('button', { name: 'Add evidence' }).first().click();
    await page.getByLabel(/Evidence title/u).fill('Synthetic evidence');
    await page.getByLabel('Sanitized summary').fill('No credentials, raw output, or personal data.');
    await page.getByRole('button', { name: 'Confirm action' }).click();
    await expect(page.getByText('Sanitized evidence added.')).toBeVisible();
    await page.getByRole('button', { name: 'Change status' }).last().click();
    await page.getByLabel('Next status').selectOption('Investigating');
    await page.getByRole('button', { name: 'Confirm action' }).click();
    await expect(page.getByText('Status changed to Investigating.')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve case' }).click();
    await page.getByLabel('Resolution summary').fill('Synthetic investigation resolved with no endpoint action.');
    await page.getByRole('button', { name: 'Confirm action' }).click();
    await expect(page.getByText('Security case resolved.')).toBeVisible();
    verify();
  });

  test('operations, reports, safe CSV download and local analytics export', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.goto('/operations');
    await expect(page.getByRole('heading', { name: 'Operations Center' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Integration health' })).toBeVisible();
    await page.goto('/reports');
    await page.getByRole('button', { name: 'Create report' }).click();
    await expect(page.getByText('Report queued.')).toBeVisible();
    const downloadLink = page.getByRole('link', { name: /Download Ticket Report/u }).first();
    await expect(downloadLink).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/u);
    await page.goto('/integrations');
    await expect(page.getByText('Export ready', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create local export' }).click();
    await expect(page.getByText(/Export created:/u)).toBeVisible();
    verify();
  });

  test('command palette supports keyboard navigation and route focus', async ({ page }) => {
    const verify = observeFailures(page);
    await login(page);
    await page.keyboard.press('Control+K');
    const search = page.getByLabel('Search commands');
    await expect(search).toBeFocused();
    await search.fill('Settings');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Tab');
    const focusVisible = await page.evaluate(() => document.activeElement !== document.body);
    expect(focusVisible).toBe(true);
    verify();
  });

  test('mobile navigation traps attention without background scrolling', async ({ page }) => {
    const verify = observeFailures(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await login(page);
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Close navigation' }).first()).toBeFocused();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    verify();
  });

  test('known state remains navigable after browser refresh', async ({ page }) => {
    await login(page);
    for (const url of [assetUrl, ticketUrl, securityCaseUrl]) {
      await page.goto(url);
      await page.reload();
      await expect(page.locator('main#main-content h1').first()).toBeVisible();
    }
  });

  test('stale browser state returns to login after session loss', async ({ page, context }) => {
    await login(page);
    await context.clearCookies();
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

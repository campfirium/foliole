import fs from 'node:fs';

import { _android, expect, test, type Page } from '@playwright/test';

const sessionFile = process.env.FOLIOLE_A5_SESSION_FILE;
// SKIP: requires a live fixed-A5 lease and acceptance WebView | 2026-11-03 | revive: run with FOLIOLE_A5_SESSION_FILE
test.skip(!sessionFile, 'Run inside the registered fixed-A5 WebView session.');

async function more(page: Page) {
  const button = page.getByRole('button', { name: 'More reading actions' });
  if (!await button.isVisible()) await page.getByRole('document', { name: 'Topic body', exact: true }).click();
  await button.click();
}
async function closeMenu(page: Page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function setHidden(page: Page, value: boolean) {
  await more(page);
  const toggle = page.getByRole('switch', { name: 'Hide system status bar' });
  if ((await toggle.getAttribute('aria-checked') === 'true') !== value) await toggle.click();
  await closeMenu(page);
}

test('the real reading canvas expands and system chrome toggles without reflow', async () => {
  const session = JSON.parse(fs.readFileSync(sessionFile!, 'utf8'));
  expect(session).toMatchObject({ serial: '87a33a4b', appId: 'com.campfirium.foliole.android.acceptance', status: 'ready' });
  const devices = await _android.devices({ host: '127.0.0.1', port: 5037 });
  const device = devices.find(candidate => candidate.serial() === session.serial)!;
  const webview = await device.webView({ socketName: session.socket });
  const page = await webview.page();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-display') ?? '{}').hideSystemStatusBar === true);
  try {
    await setHidden(page, false);
    const normalHeight = await page.evaluate(() => innerHeight);
    await setHidden(page, true);
    await expect.poll(() => page.evaluate(() => innerHeight)).toBeGreaterThan(normalHeight);
    const expanded = await page.evaluate(() => innerHeight);
    const bodyTop = await page.locator('.cm-content').first().evaluate(element => element.getBoundingClientRect().top);
    await device.screenshot({ path: '.tmp/artifacts/T701/reopened/native-chrome-visible.png' });
    await page.getByRole('document', { name: 'Topic body', exact: true }).click();
    await expect(page.getByRole('button', { name: 'More reading actions' })).toBeHidden();
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(expanded);
    await expect.poll(() => page.locator('.cm-content').first().evaluate(element => element.getBoundingClientRect().top)).toBe(bodyTop);
    await device.screenshot({ path: '.tmp/artifacts/T701/reopened/native-chrome-hidden.png' });
    await page.getByRole('document', { name: 'Topic body', exact: true }).click();
    await expect(page.getByRole('button', { name: 'More reading actions' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(expanded);
    await expect.poll(() => page.locator('.cm-content').first().evaluate(element => element.getBoundingClientRect().top)).toBe(bodyTop);
  } finally {
    await setHidden(page, original);
    await device.close();
  }
});

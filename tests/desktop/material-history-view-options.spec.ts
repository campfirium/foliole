import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const content = 'History preview text ' + 'WIDE WINDOW WELCOME '.repeat(12).trim();
const title = 'History layout topic';

async function openHistory(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' }).getByRole('button', { name: 'History', exact: true }).click();
  return page.getByRole('dialog', { name: 'History', exact: true });
}

test('history view options apply immediately and return after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ title, content }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'history-layout', kind: 'topic', parentNodeId: 'special-inbox', title, content }
    ], { persist: true });
  }, { title, content });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('treeitem', { name: title, exact: true }).click();

  const history = await openHistory(page);
  const trigger = history.getByRole('button', { name: 'View options' });
  const options = history.getByRole('group', { name: 'View options' });
  const preview = history.getByText(/^History preview text/);
  const previewFirst = history.getByRole('button', { name: /^History preview text.*History layout topic$/ });
  const breadcrumbFirst = history.getByRole('button', { name: /^.*History layout topic History preview text/ });
  await expect(previewFirst).toBeVisible();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');

  await trigger.click();
  await expect(options.getByRole('radio', { name: 'Preview first' })).toBeChecked();
  await expect(options.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await options.getByText('Breadcrumb first', { exact: true }).click();
  await expect(breadcrumbFirst).toBeVisible();
  await options.getByText('1', { exact: true }).click();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '1');
  await options.getByRole('radio', { name: '1', exact: true }).press('ArrowRight');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await options.getByText('3', { exact: true }).click();
  await expect.poll(() => preview.evaluate(element =>
    element.clientHeight / Number.parseFloat(getComputedStyle(element).lineHeight)
  )).toBe(3);
  await history.screenshot({ path: '.tmp/artifacts/T774/history-view-options.png' });

  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(history).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_app_settings_state', {});
    const value = settings?.['foliole-material-history-view'];
    return value && JSON.parse(value);
  })).toEqual({ first: 'breadcrumb', lines: 3 });

  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await openHistory(page);
  await expect(breadcrumbFirst).toBeVisible();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');

  await page.evaluate(() => window.localStorage.removeItem('foliole-material-history-view'));
  await page.reload();
  await expectWorkspaceShell(page);
  await openHistory(page);
  await expect(breadcrumbFirst).toBeVisible();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');
  await trigger.click();
  await expect(options.getByRole('radio', { name: 'Breadcrumb first' })).toBeChecked();
  await expect(options.getByRole('radio', { name: '3', exact: true })).toBeChecked();
  await history.getByRole('searchbox').click();
  await expect(options).toBeHidden();
});

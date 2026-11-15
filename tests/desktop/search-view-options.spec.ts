import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const title = 'Quartz search view sample';
const previewStart = '搜索结果正文预览';
const timestamp = '2026-04-08T00:00:00.000Z';
const storageKey = 'foliole-search-palette-view';

async function openSearch(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' })
    .getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspace search' });
  await dialog.getByRole('textbox', { name: 'Search workspace' }).fill(title);
  await expect(dialog.getByRole('button', { name: new RegExp(title, 'i') })).toBeVisible();
  return dialog;
}

test('search view options apply to the current results and survive reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ title, previewStart }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'search-view-layout', kind: 'topic', title, content: previewStart.repeat(24) }
    ], { persist: true });
  }, { title, previewStart });
  await page.reload();
  await expectWorkspaceShell(page);

  const dialog = await openSearch(page);
  const row = dialog.getByRole('button', { name: new RegExp(title, 'i') });
  const preview = row.getByText(new RegExp(`^${previewStart}`)).locator('..');
  const time = row.locator('time');
  const trigger = dialog.getByRole('button', { name: 'View options' });
  const options = dialog.getByRole('group', { name: 'View options' });
  const showTimestamp = options.getByRole('switch', { name: 'Show date and time' });
  const dateLabel = await page.evaluate(value => new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value)), timestamp);
  await expect(time).toHaveAttribute('datetime', timestamp);
  await expect(time).toHaveText(dateLabel);
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');

  await trigger.click();
  await expect(showTimestamp).toBeChecked();
  await expect(options.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await options.getByText('1', { exact: true }).click();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '1');
  const oneLineHeight = await preview.evaluate(element => element.clientHeight);
  await options.getByRole('radio', { name: '1', exact: true }).press('ArrowRight');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await options.getByText('3', { exact: true }).click();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');
  await expect.poll(() => preview.evaluate(element => element.clientHeight)).toBeGreaterThan(oneLineHeight);
  await dialog.screenshot({ path: '.tmp/artifacts/T781/search-view-options.png' });
  await showTimestamp.click();
  await expect(time).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeVisible();

  await expect.poll(() => page.evaluate(async key => {
    const settings = await window.electronAPI.invoke('load_app_settings_state', {});
    const value = settings?.[key];
    return value && JSON.parse(value);
  }, storageKey)).toEqual({ lines: 3, showTimestamp: false });
  await page.evaluate(key => window.localStorage.removeItem(key), storageKey);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSearch(page);
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');
  await expect(time).toBeHidden();
  await trigger.click();
  await expect(options.getByRole('radio', { name: '3', exact: true })).toBeChecked();
  await showTimestamp.click();
  await expect(time).toHaveText(dateLabel);
});

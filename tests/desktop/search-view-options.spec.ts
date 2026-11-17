import type { Locator, Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const title = 'Quartz search view sample';
const previewStart = 'A short introduction';
const query = 'Quartz';
const timestamp = '2026-04-08T00:00:00.000Z';
const storageKey = 'foliole-search-palette-view';

async function openSearch(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' })
    .getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspace search' });
  await dialog.getByRole('textbox', { name: 'Search workspace' }).fill(query);
  await expect(dialog.getByRole('button', { name: new RegExp(title, 'i') })).toBeVisible();
  return dialog;
}

test('search view options apply to the current results and survive app restart', async ({ desktopSession, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ title, previewStart }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'search-view-layout', kind: 'topic', title, content: `${previewStart}: Quartz. ${'A long passage with enough text for several lines. '.repeat(24)}` }
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
  await adjustPreviewLines(dialog, preview);
  await adjustFontSizes(dialog);
  await expect.poll(() => preview.evaluate(element =>
    element.clientHeight / Number.parseFloat(getComputedStyle(element).lineHeight)
  )).toBe(3);
  await dialog.screenshot({ path: '.tmp/artifacts/T781-1/search-view-options.png' });
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
  }, storageKey)).toEqual({ lines: 3, showTimestamp: false, titleFontSize: 18, previewFontSize: 16, metadataFontSize: 11 });
  await page.evaluate(key => window.localStorage.removeItem(key), storageKey);
  await desktopSession.electronApp.close();
  const restarted = await launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot }
  }) as DesktopSession;
  try {
    await normalizeDesktopWindow(restarted);
    await verifyRestart(restarted.firstWindow, dateLabel);
  } finally {
    await restarted.close();
  }
});

async function adjustPreviewLines(dialog: Locator, preview: Locator) {
  const lines = dialog.getByRole('group', { name: 'Preview lines' });
  const fewer = lines.getByRole('button', { name: 'Decrease preview lines' });
  const more = lines.getByRole('button', { name: 'Increase preview lines' });
  await expect(lines.getByRole('status')).toHaveText('2');
  await fewer.click();
  await expect(fewer).toBeDisabled();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '1');
  await more.press('Enter');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await more.click();
  await expect(more).toBeDisabled();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');

}

async function verifyRestart(page: Page, dateLabel: string) {
  await expectWorkspaceShell(page);
  const dialog = await openSearch(page);
  await expect(dialog.getByText(new RegExp(`^${previewStart}`)).locator('..')).toHaveCSS('-webkit-line-clamp', '3');
  await expect(dialog.locator('time')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'View options' }).click();
  await expect(dialog.getByRole('group', { name: 'Preview lines' }).getByRole('status')).toHaveText('3');
  await expectFontSizes(dialog, [18, 16, 11]);
  await dialog.getByRole('switch', { name: 'Show date and time' }).click();
  await expect(dialog.locator('time')).toHaveText(dateLabel);
  await expect(dialog.locator('time')).toHaveCSS('font-size', '11px');
}

const fontLabels = ['Title font size', 'Preview font size', 'Metadata font size'];

async function expectFontSizes(dialog: Locator, [heading, preview, metadata]: [number, number, number]) {
  for (const [index, size] of [heading, preview, metadata].entries()) {
    await expect(dialog.getByRole('group', { name: fontLabels[index] }).getByRole('status')).toHaveText(String(size));
  }
  const row = dialog.getByRole('button', { name: new RegExp(title, 'i') });
  await expect(row.getByText(new RegExp(`^${title}$`))).toHaveCSS('font-size', `${heading}px`);
  await expect(row.getByText(new RegExp(`^${previewStart}`)).locator('..')).toHaveCSS('font-size', `${preview}px`);
  const time = row.locator('time');
  if (await time.count()) await expect(time).toHaveCSS('font-size', `${metadata}px`);
}

async function adjustFontSizes(dialog: Locator) {
  await expectFontSizes(dialog, [17, 15, 12]);
  await dialog.getByRole('button', { name: 'Increase title font size' }).click();
  await expectFontSizes(dialog, [18, 15, 12]);
  await dialog.getByRole('button', { name: 'Increase preview font size' }).click();
  await expectFontSizes(dialog, [18, 16, 12]);
  await dialog.getByRole('button', { name: 'Decrease metadata font size' }).click();
  await expectFontSizes(dialog, [18, 16, 11]);
}

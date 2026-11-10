import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T750');
const topicId = 'postpone-days';

async function switchToDays(page: Page, dialog: Locator) {
  const unitMenu = dialog.getByRole('button', { name: 'By week' });
  await unitMenu.click();
  await expect(page.getByRole('menuitemradio', { name: 'By week', checked: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'postpone-unit-menu.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(dialog).toBeVisible();
  await unitMenu.click();
  await page.getByRole('menuitemradio', { name: 'By week' }).click();
  await expect(unitMenu).not.toBeFocused();
  await expect(dialog).toBeVisible();
  await unitMenu.click();
  await page.getByRole('menuitemradio', { name: 'By day' }).click();
}

async function enterCustomDays(page: Page, dialog: Locator, dueAfter: (days: number) => string) {
  const input = dialog.getByRole('textbox', { name: 'Days until next appearance' });
  await expect(input).toBeFocused();
  await dialog.screenshot({ path: path.join(output, 'postpone-days-focused.png') });
  await page.keyboard.type('14');
  await expect(input).toHaveValue('14');
  const slider = dialog.getByRole('slider');
  await slider.press('End');
  await expect(input).toHaveValue('30');
  const dateLabel = (days: number) => page.evaluate(date => new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date(date)), dueAfter(days));
  await expect(dialog.getByRole('status')).toHaveText(await dateLabel(30));
  await input.selectText();
  await page.keyboard.type('45');
  await expect(input).toHaveValue('45');
  await expect(dialog.getByRole('status')).toHaveText(await dateLabel(45));
}

test('keeps week shortcuts by default and applies arbitrary days with one Enter', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const now = new Date();
  const at = now.toISOString();
  await page.clock.setFixedTime(now);
  const reading = { intervalDurationMs: 1209600000, intervalGrowthFactor: 1.7, lastHandledAt: at, nextAt: at,
    priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
  await page.evaluate(async ({ topicId, reading, at }) => {
    localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: topicId, kind: 'topic',
      title: 'Postpone days', content: 'Postpone by an exact day count' }], { persist: true });
    await window.electronAPI.invoke('save_node_reading_state', { nodeId: topicId, reading, updatedAt: at });
  }, { topicId, reading, at });
  await page.reload();
  await expectWorkspaceShell(page);
  const openTopic = () => page.locator('[data-node-id="postpone-days"]').first().click();
  const openPostpone = () => page.keyboard.press(process.platform === 'darwin' ? 'Meta+j' : 'Control+j');
  const facts = () => page.evaluate(async id => (await window.electronAPI.invoke('load_workspace_snapshot', {}))
    .nodesById[id]?.reading, topicId);
  const dueAfter = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const dialog = page.getByRole('dialog', { name: 'Postpone Topic' });

  await openTopic();
  await openPostpone();
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  await mkdir(output, { recursive: true });
  await dialog.screenshot({ path: path.join(output, 'postpone-weeks.png') });
  await page.keyboard.press('9');
  await expect(dialog).toBeHidden();
  await expect.poll(facts).toEqual({ ...reading, nextAt: dueAfter(63) });

  await openPostpone();
  await switchToDays(page, dialog);
  await expect(dialog.getByRole('textbox', { name: 'Days until next appearance' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expectWorkspaceShell(page);
  await openTopic();
  await openPostpone();
  await enterCustomDays(page, dialog, dueAfter);
  expect(await facts()).toEqual({ ...reading, nextAt: dueAfter(63) });
  await dialog.screenshot({ path: path.join(output, 'postpone-days.png') });
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect.poll(facts).toEqual({ ...reading, nextAt: dueAfter(45) });

  await openPostpone();
  const slider = dialog.getByRole('slider');
  await slider.press('Home');
  const input = dialog.getByRole('textbox', { name: 'Days until next appearance' });
  await expect(input).toHaveValue('0');
  await input.press('Enter');
  await expect(dialog).toBeHidden();
  await expect.poll(facts).toEqual({ ...reading, nextAt: dueAfter(14) });
});

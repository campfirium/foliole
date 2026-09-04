import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOCUS_SETTING_KEY = 'foliole-view-hide-dismissed-topics';
const SCREENSHOT = path.resolve('.tmp/artifacts/topic-focus-shelved-hidden-native.png');

async function enableTopicFocus(page: Page) {
  await page.evaluate(async (settingKey) => {
    const settings = await window.electronAPI?.invoke('load_app_settings_state', {}) ?? {};
    await window.electronAPI?.invoke('save_app_settings_state', {
      settings: { ...settings, [settingKey]: 'true', 'foliole-app-language': 'en' }
    });
    window.localStorage.setItem(settingKey, 'true');
    window.localStorage.setItem('foliole-app-language', 'en');
  }, FOCUS_SETTING_KEY);
  await page.reload();
  await expectWorkspaceShell(page);
}

async function createShelvedTopic(page: Page) {
  return page.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug;
    const nodeId = await debug?.createRootNode?.('', 'topic') ?? null;
    if (!nodeId) return null;
    await debug?.updateNodeTitle?.(nodeId, 'Shelved focus contract topic');
    return debug?.shelveNode?.(nodeId, '2026-09-05T00:00:00.000Z') ? nodeId : null;
  });
}

test('Shelved ignores Topic Focus without changing the global preference', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await enableTopicFocus(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));

  const nodeId = await createShelvedTopic(desktopWindow);
  expect(nodeId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode?.(id)?.shelvedAt ?? null, nodeId!
  )).not.toBeNull();

  await desktopWindow.locator('[data-node-id="special-virtual-shelved"]').first().click();
  await expect(desktopWindow.getByRole('treeitem', { name: 'Shelved focus contract topic' })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: 'Hide dismissed and shelved topics' })).toBeDisabled();
  expect(await desktopWindow.evaluate((key) => localStorage.getItem(key), FOCUS_SETTING_KEY)).toBe('true');

  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT });
  await testInfo.attach('topic-focus-shelved-hidden-native', { contentType: 'image/png', path: SCREENSHOT });

  await desktopWindow.locator('[data-node-id="special-inbox"]').first().click();
  await expect(desktopWindow.getByRole('button', { name: 'Show all topics' })).toBeVisible();
  expect(await desktopWindow.evaluate((key) => localStorage.getItem(key), FOCUS_SETTING_KEY)).toBe('true');
});

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/guided-sample-content-hidden.png');
const ROOT_ASSET_ID = '58536364fbf6f93cf0ada37f58121eacff907adc9b1a57193c9ebc0cb77d270b';

async function replaceGuidedSampleForLocale(page: Page, locale: 'de' | 'zh-Hant') {
  await expect.poll(() => readActiveGuide(page)).toMatchObject({ rootCount: 1 });
  await page.evaluate(async ({ assetId, nextLocale }) => {
    const api = window.__folioleWorkspaceDebug;
    const root = api?.listNodes()
      .map(({ id }) => api.getNode(id))
      .find((node) => node && !node.trashed && node.parentNodeId === 'special-inbox' && node.content.includes(assetId));
    if (!api || !root) throw new Error('Active guided sample root not found');
    await api.deleteNode(root.id);
    const settings = await window.electronAPI?.invoke('load_app_settings_state', {}) ?? {};
    await window.electronAPI?.invoke('save_app_settings_state', {
      settings: { ...settings, 'foliole-app-language': nextLocale }
    });
    window.localStorage.setItem('foliole-app-language', nextLocale);
  }, { assetId: ROOT_ASSET_ID, nextLocale: locale });
  await page.reload();
  await page.getByRole('main').first().waitFor({ state: 'visible' });
}

async function readActiveGuide(page: Page) {
  return page.evaluate((assetId) => {
    const api = window.__folioleWorkspaceDebug;
    const nodes = api?.listNodes().map(({ id }) => api.getNode(id)).filter((node) => node && !node.trashed) ?? [];
    const roots = nodes.filter((node) =>
      node?.parentNodeId === 'special-inbox' && node.content.includes(assetId)
    );
    const root = roots[0] ?? null;
    const children = root ? nodes.filter((node) => node?.parentNodeId === root.id) : [];
    return {
      childCount: children.length,
      childTitles: children.map((node) => node?.title),
      root,
      rootCount: roots.length
    };
  }, ROOT_ASSET_ID);
}

test('creates localized image-bearing guided samples once across reloads', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  await replaceGuidedSampleForLocale(desktopWindow, 'de');
  await expect.poll(() => readActiveGuide(desktopWindow)).toMatchObject({
    childCount: 7,
    root: { title: 'Willkommen bei Foliole' },
    rootCount: 1
  });
  expect((await readActiveGuide(desktopWindow)).childTitles).toContain('Lesen: Das Ganze in Teile zerlegen');

  await replaceGuidedSampleForLocale(desktopWindow, 'zh-Hant');
  await expect.poll(() => readActiveGuide(desktopWindow)).toMatchObject({
    childCount: 7,
    root: { title: '歡迎使用 Foliole' },
    rootCount: 1
  });
  const beforeReload = await readActiveGuide(desktopWindow);
  expect(beforeReload.childTitles).toContain('閱讀：化整為零');
  expect(beforeReload.root?.content).toContain('asset://');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(() => readActiveGuide(desktopWindow)).toMatchObject({
    root: { id: beforeReload.root?.id, title: '歡迎使用 Foliole' },
    rootCount: 1
  });

  await desktopWindow.getByRole('button', { name: '閱讀：化整為零', exact: true }).click();
  await expect(desktopWindow.getByRole('main').getByRole('img', { name: 'image' })).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT_PATH });
  await testInfo.attach('guided-sample-content-hidden', { contentType: 'image/png', path: SCREENSHOT_PATH });
});

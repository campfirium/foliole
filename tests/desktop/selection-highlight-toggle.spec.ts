import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument, loadWorkspaceSnapshot } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const parentId = 'toggle-source';
const content = 'Alpha\n\nBeta\n\nGamma';
const locator = { from: 7, to: 11, originalText: 'Beta' };

async function openImmersiveSelection(page: Page) {
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), parentId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Beta');
  await page.keyboard.press('F11');
  await expect(page.getByLabel('Window controls')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 7, 11) ?? false)).toBe(true);
  await page.locator('.prompt-editor-host .cm-content').evaluate((element) => (element as HTMLElement).blur());
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug?.getEditorSelection?.('prompt-editor'))).toMatchObject({ from: 7, to: 11 });
}

async function visibleChildren(page: Page) {
  const snapshot = await loadWorkspaceSnapshot(page);
  const trash = new Set(snapshot?.trashedNodeIds ?? []);
  return Object.values(snapshot?.nodesById ?? {}).filter((node) => node.parentNodeId === parentId && !trash.has(node.id));
}

async function seed(page: Page, duplicates = false) {
  await page.evaluate(async ({ content, duplicates, locator, parentId }) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([
      { id: parentId, kind: 'topic', title: 'Toggle source', content },
      ...(duplicates ? ['toggle-first', 'toggle-second'].map((id) => ({
        id, kind: 'topic' as const, title: 'Beta', content: 'Beta', parentNodeId: parentId,
        anchorLink: { id, kind: 'highlight' as const, locator }
      })) : [])
    ], { persist: true });
  }, { content, duplicates, locator, parentId });
}

test('immersive H creates and removes the same persisted highlight without changing source text', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seed(page);
  await openImmersiveSelection(page);
  await page.keyboard.press('h');
  await expect.poll(async () => (await visibleChildren(page)).length).toBe(1);
  const [created] = await visibleChildren(page);
  expect(created.anchorLink).toMatchObject({ kind: 'highlight', locator });
  expect((await loadNodeDocument(page, parentId))?.content).toBe(content);
  await page.screenshot({ path: '.tmp/artifacts/T571/created.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  await openImmersiveSelection(page);
  await page.keyboard.press('h');
  await expect.poll(async () => (await loadWorkspaceSnapshot(page))?.trashedNodeIds).toContain(created.id);
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await visibleChildren(page)).toEqual([]);
  expect((await loadNodeDocument(page, parentId))?.content).toBe(content);
});

test('immersive H removes only the first exact duplicate and persists the other', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seed(page, true);
  const before = await visibleChildren(page);
  expect(before).toHaveLength(2);
  await openImmersiveSelection(page);
  await page.keyboard.press('h');
  await expect.poll(async () => (await visibleChildren(page)).map((node) => node.id)).toEqual([before[1].id]);
  expect((await loadWorkspaceSnapshot(page))?.trashedNodeIds).toContain(before[0].id);
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await visibleChildren(page)).map((node) => node.id)).toEqual([before[1].id]);
  expect((await loadNodeDocument(page, parentId))?.content).toBe(content);
});

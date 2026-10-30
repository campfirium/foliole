import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument, loadWorkspaceSnapshot } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const itemId = 'sibling-item';
const topicId = 'sibling-topic';
const content = 'Rewritten [...] Gamma';

async function siblings(page: Page) {
  const snapshot = await loadWorkspaceSnapshot(page);
  return Object.values(snapshot?.nodesById ?? {}).filter(node => node.parentNodeId === topicId && node.id !== itemId);
}

async function selectGamma(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 16, 21) ?? false)).toBe(true);
  await page.locator('.prompt-editor-host .cm-content').evaluate(element => (element as HTMLElement).blur());
}

test('creates sibling highlights and clozes while reading an edited Item and preserves them after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ itemId, topicId, content }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: topicId, title: 'Original Topic', kind: 'topic', content: 'Original parent text' },
      { id: itemId, title: 'Edited Item', kind: 'item', parentNodeId: topicId, content, reveal: 'Beta' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(itemId);
  }, { itemId, topicId, content });
  await expect(page.locator('.prompt-editor-host')).toContainText('Gamma');
  await page.keyboard.press('F11');
  await selectGamma(page);
  await page.keyboard.press('Alt+z');
  await expect.poll(async () => (await siblings(page)).length).toBe(1);
  await selectGamma(page);
  await page.keyboard.press('Alt+x');
  await expect.poll(async () => (await siblings(page)).length).toBe(2);
  const created = await siblings(page);
  for (const node of created) {
    const saved = await loadNodeDocument(page, node.id);
    expect(node.anchorLink).toBeNull();
    expect(saved).toMatchObject(node.kind === 'item'
      ? { content: 'Rewritten Beta [...]', reveal: 'Gamma' } : { content: 'Gamma', reveal: null });
  }
  expect((await loadNodeDocument(page, itemId))?.content).toBe(content);
  expect((await loadNodeDocument(page, topicId))?.content).toBe('Original parent text');
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await siblings(page)).map(node => node.id).sort()).toEqual(created.map(node => node.id).sort());
  expect((await loadWorkspaceSnapshot(page))?.nodesById[itemId]?.parentNodeId).toBe(topicId);
});

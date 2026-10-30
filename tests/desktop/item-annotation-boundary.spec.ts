import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument, loadWorkspaceSnapshot } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const itemId = 'annotation-item';
const topicId = 'annotation-topic';
const content = 'Rewritten [...] Gamma';

async function seed(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ itemId, topicId, content }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: topicId, title: 'Topic', kind: 'topic', content: 'Alpha Beta Gamma' },
      { id: itemId, title: 'Item', kind: 'item', parentNodeId: topicId, content, reveal: 'Beta' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(itemId);
  }, { itemId, topicId, content });
}

async function select(page: Page, from: number, to: number) {
  await expect.poll(() => page.evaluate(([from, to]) =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', from, to) ?? false, [from, to])).toBe(true);
  await page.locator('.prompt-editor-host .cm-content').evaluate(element => (element as HTMLElement).blur());
}

test('Items do not expose annotation actions and reject shortcuts and direct creation without changing persisted data', async ({ desktopWindow: page }) => {
  await seed(page);
  await expect(page.locator('.prompt-editor-host')).toContainText('Gamma');
  const before = await loadWorkspaceSnapshot(page);
  await select(page, 16, 21);
  await page.mouse.up();
  await expect(page.locator('[data-annotation-toolbar="true"]')).toHaveCount(0);
  for (const key of ['Alt+z', 'Alt+x', 'Alt+a']) await page.keyboard.press(key);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(palette).toBeVisible();
  const highlight = palette.getByRole('button', { name: /^(Highlight Selection|高亮所选内容)$/ });
  await expect(highlight).toBeDisabled();
  await expect(palette.getByRole('button', { name: /^(Cloze Selection|挖空所选内容)$/ })).toBeDisabled();
  await highlight.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.tmp/artifacts/T642/item-annotation-commands-hidden.png' });
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async id => {
    const api = window.__folioleWorkspaceDebug!;
    return [await api.createTextHighlightChild({ parentNodeId: id, text: 'Gamma', anchorId: 'blocked-highlight' }),
      await api.createTextClozeChild({ parentNodeId: id, prompt: '[...]', answer: 'Gamma', anchorId: 'blocked-cloze' })];
  }, itemId);
  expect(result).toEqual([null, null]);
  expect((await loadWorkspaceSnapshot(page))?.nodeOrder).toEqual(before?.nodeOrder);
  expect((await loadNodeDocument(page, itemId))?.content).toBe(content);
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await loadWorkspaceSnapshot(page))?.nodeOrder).toEqual(before?.nodeOrder);
});

test('Topics retain anchored highlight and cloze creation after the Item restriction', async ({ desktopWindow: page }) => {
  await seed(page);
  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), topicId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Alpha');
  await select(page, 0, 5);
  await page.keyboard.press('Alt+z');
  await expect.poll(async () => Object.values((await loadWorkspaceSnapshot(page))?.nodesById ?? {})
    .filter(node => node.parentNodeId === topicId && node.id !== itemId).length).toBe(1);
  await select(page, 6, 10);
  await page.keyboard.press('Alt+x');
  await expect.poll(async () => Object.values((await loadWorkspaceSnapshot(page))?.nodesById ?? {})
    .filter(node => node.parentNodeId === topicId && node.id !== itemId).length).toBe(2);
  const children = Object.values((await loadWorkspaceSnapshot(page))?.nodesById ?? {}).filter(node => node.parentNodeId === topicId && node.id !== itemId);
  expect(children.map(node => node.anchorLink?.kind).sort()).toEqual(['cloze', 'highlight']);
  await page.screenshot({ path: '.tmp/artifacts/T642/topic-annotation-controls-preserved.png' });
  for (const node of children) expect((await loadNodeDocument(page, node.id))?.content).toBe(node.kind === 'item' ? 'Alpha [...] Gamma' : 'Alpha');
});

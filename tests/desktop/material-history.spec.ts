import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const active = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId());

async function openHistoryFromRail(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' }).getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  await expect(history).toBeVisible();
  return history;
}

async function openHistory(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' }).getByRole('button', { name: 'Command Palette' }).click();
  const commands = page.getByRole('dialog', { name: 'Command palette' });
  await commands.getByRole('textbox').fill('History');
  await commands.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'History', exact: true })).toBeVisible();
}

async function captureSearchPanelFrame(page: Page) {
  await page.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  const rail = page.getByRole('region', { name: 'Left toolbar' });
  await rail.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Workspace search' });
  await expect(search.getByRole('textbox', { name: 'Search workspace' })).toBeVisible();
  const frame = await search.getByRole('textbox').locator('../..').boundingBox();
  expect(frame).not.toBeNull();
  await search.getByRole('textbox').locator('../..').screenshot({ path: path.resolve('.tmp/artifacts/T774/search-panel-reference.png') });
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  return frame;
}

async function expectSearchPanelLayout(history: Locator, frame: Awaited<ReturnType<typeof captureSearchPanelFrame>>) {
  const panel = history.getByRole('searchbox').locator('../..');
  expect(await panel.boundingBox()).toEqual(frame);
  const collapse = history.getByRole('button', { name: 'Collapse history shortcuts' });
  await expect(history.getByText('Enter', { exact: true })).toBeVisible();
  await collapse.click();
  await expect(history.getByText('Enter', { exact: true })).toBeHidden();
  await history.getByRole('button', { name: 'Show history shortcuts' }).click();
  await expect(history.getByText('Enter', { exact: true })).toBeVisible();
  await history.getByRole('searchbox').fill('No matching history text');
  await expect(history.getByText('No matching materials')).toBeVisible();
  expect(await panel.boundingBox()).toEqual(frame);
  await history.getByRole('searchbox').fill('');
}

async function captureHistoryRail(page: Page) {
  const rail = page.getByRole('region', { name: 'Left toolbar' });
  await expect(rail.getByRole('button', { name: 'Publish to Discourse' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await rail.screenshot({ path: path.resolve('.tmp/artifacts/T774/material-history-rail.png') });
}

test('reopens the exact visited child from persisted desktop history', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-workspace-rail-items', JSON.stringify([{
      id: 'user.workspace-publishToDiscourse', commandId: 'workspace.publishToDiscourse', section: 'top',
      order: 6, visible: true, source: 'user', labelOverride: 'Publish to Discourse', iconId: 'MessagesSquare'
    }]));
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([
      { id: 'history-parent', kind: 'topic', title: 'History source', parentNodeId: 'special-inbox', content: 'Parent body ' + 'This opening is long enough to show the second line of the history preview. '.repeat(3) },
      { id: 'history-child', kind: 'topic', parentNodeId: 'history-parent', title: 'History extract', content: 'Exact derived body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await captureHistoryRail(page);
  await page.getByRole('button', { name: 'Expand all topics' }).click();
  await page.getByRole('treeitem', { name: 'History extract' }).click();
  await expect.poll(() => active(page)).toBe('history-child');
  const searchFrame = await captureSearchPanelFrame(page);
  const immediately = await openHistoryFromRail(page);
  await expectSearchPanelLayout(immediately, searchFrame);
  await expect(immediately.getByRole('button', { name: /Exact derived body.*History source \/ History extract$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(immediately).toBeHidden();
  await page.getByRole('treeitem', { name: 'History source' }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Boolean(snapshot.nodeOpenStateById?.['history-child']);
  })).toBe(true);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const session = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await expect.poll(async () => (await session()).currentNodeId).toBeTruthy();
  const flowNodeId = (await session()).currentNodeId;
  await expect.poll(async () => page.evaluate(async (id) => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Boolean(id && snapshot.nodeOpenStateById?.[id]);
  }, flowNodeId)).toBe(true);
  const before = await active(page);
  const history = await openHistoryFromRail(page);
  await expect(history.getByRole('button', { name: /Exact derived body.*History source \/ History extract$/ })).toBeVisible();
  await expect(history.getByRole('button', { name: /^Parent body.*second line/ })).toBeVisible();
  await expect(history.getByText('History source', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T774/material-history-native.png') });
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  expect(await active(page)).toBe(before);
  await openHistoryFromRail(page);
  await history.getByRole('searchbox', { name: 'Search history…' }).fill('Exact derived');
  await expect(history.getByRole('button', { name: /Exact derived body.*History source \/ History extract$/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => active(page)).toBe('history-child');
  await expect(history).toBeHidden();
  expect((await session()).currentNodeId).toBe(flowNodeId);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => active(page)).toBe(flowNodeId);
});

async function scrollAndOpenOlderHistory(page: Page, history: Locator) {
  await expect(history.getByRole('searchbox')).toBeFocused();
  const target = history.getByRole('button', { name: /^Ordered body 2 Ordered topic 2$/ });
  await expect(target).not.toBeInViewport();
  await history.getByRole('button', { name: /^Ordered body 11 Ordered topic 11$/ }).hover();
  await page.mouse.wheel(0, 1500);
  await expect(target).toBeInViewport();
  for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowDown');
  await expect(history.getByRole('searchbox')).toBeFocused();
  await expect(target).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect.poll(() => active(page)).toBe('ordered-2');
}

test('pins, promotes a saved edit, and scrolls to older history from the search field', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes(Array.from({ length: 12 }, (_, index) => ({
      id: `ordered-${index}`, kind: 'topic', title: `Ordered topic ${index}`,
      parentNodeId: 'special-inbox', content: `Ordered body ${index}`
    })), { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  for (let index = 0; index < 12; index++) {
    await page.getByRole('treeitem', { name: `Ordered topic ${index}`, exact: true }).click();
  }
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  await page.keyboard.press('ControlOrMeta+Shift+H');
  await expect(history).toBeVisible();
  await scrollAndOpenOlderHistory(page, history);
  await openHistory(page);
  const target = history.getByRole('button', { name: /^Ordered body 2 Ordered topic 2$/ });
  await target.hover();
  await target.locator('..').getByRole('button', { name: 'Pin material' }).click();
  await expect(history.getByRole('button', { name: 'Pin material', pressed: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem', { name: 'Ordered topic 0', exact: true }).click();
  const editor = page.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('Promoted saved edit');
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  await page.getByRole('treeitem', { name: 'Ordered topic 11', exact: true }).click();
  await openHistory(page);
  await expect(history.getByRole('button', { name: /^Promoted saved edit Ordered topic 0$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expectWorkspaceShell(page);
  await openHistory(page);
  const materialRows = history.getByRole('button', { name: /^(?:Ordered body \d+|Promoted saved edit) Ordered topic \d+$/ });
  await expect(materialRows.nth(0)).toHaveAccessibleName('Ordered body 2 Ordered topic 2');
  await expect(materialRows.nth(1)).toHaveAccessibleName('Promoted saved edit Ordered topic 0');
  await expect(history.getByRole('button', { name: /Ordered body 2 Ordered topic 2$/ })).toHaveCount(1);
  await history.getByRole('button', { name: 'Pin material', pressed: true }).click();
  await expect(history.getByRole('button', { name: /^Promoted saved edit Ordered topic 0$/ })).toBeVisible();
  await history.getByRole('searchbox').fill('Ordered');
  await page.keyboard.press('Space');
  await page.keyboard.insertText('body 1');
  await expect(history.getByRole('searchbox')).toHaveValue('Ordered body 1');
  await expect(history.getByRole('button', { name: 'Pin material', pressed: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: /Ordered body 1 Ordered topic 1$/ })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T774/material-history-ordering.png') });
});

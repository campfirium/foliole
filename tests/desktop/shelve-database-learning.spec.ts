import path from 'node:path';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('shelves sequential topics through database facts and preserves learning on undo, redo and reopening', async ({ desktopWindow: page, desktopApp }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  const reading = await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const ids = Object.values(snapshot.nodesById).filter(node => node.kind === 'topic' || node.kind === 'item').map(node => node.id);
    if (ids.length) await window.electronAPI.invoke('soft_delete_nodes', { nodeIds: ids, deletedAt: new Date().toISOString() });
    const at = new Date().toISOString();
    const facts = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: at, nextAt: at,
      priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'shelve-source', kind: 'folder', title: 'Shelve source', content: '' },
      { id: 'shelve-a', kind: 'topic', parentNodeId: 'shelve-source', title: 'Shelve A', content: 'Shelf body A', reading: facts },
      { id: 'shelve-b', kind: 'topic', parentNodeId: 'shelve-source', title: 'Shelve B', content: 'Shelf body B', reading: { ...facts, state: 'locked' } }
    ], { persist: true });
    return facts;
  });
  await page.locator('[data-node-id="shelve-source"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Enable Sequential Reading', exact: true }).click();
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('shelve-a');
  await page.locator('[data-node-id="shelve-a"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Shelve entire topic', exact: true }).click();
  const facts = () => page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  await expect.poll(async () => (await facts()).nodesById['shelve-a']?.shelvedAt).toBeTruthy();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('shelve-b');
  expect((await facts()).nodesById['shelve-b']?.reading).toEqual(reading);
  await runPaletteHistoryCommand(page, 'Undo Shelve Topic');
  await expect.poll(async () => (await facts()).nodesById['shelve-a']?.shelvedAt).toBeFalsy();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('shelve-a');
  expect((await facts()).nodesById['shelve-b']?.reading).toEqual({ ...reading, state: 'locked' });
  await runPaletteHistoryCommand(page, 'Redo Shelve Topic');
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('shelve-b');
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await facts()).nodesById['shelve-a']?.reading).toEqual(reading);
  expect((await facts()).nodesById['shelve-b']?.reading).toEqual(reading);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T632/shelve-database-learning.png') });
});

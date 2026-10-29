import fs from 'node:fs';
import path from 'node:path';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T632/source-settings-native');

test('saves sequential reading before replacing a locked Flow current and keeps it after reload', async ({ desktopWindow: page, desktopApp }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const nodeIds = Object.values(snapshot.nodesById).filter(node => node.kind === 'topic' || node.kind === 'item').map(node => node.id);
    if (nodeIds.length) await window.electronAPI.invoke('soft_delete_nodes', { nodeIds, deletedAt: new Date().toISOString() });
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'settings-source', kind: 'folder', title: 'Source settings', content: '' },
      { id: 'settings-a', kind: 'topic', parentNodeId: 'settings-source', title: 'Source A', content: 'Source A body' },
      { id: 'settings-b', kind: 'topic', parentNodeId: 'settings-source', title: 'Source B', content: 'Source B body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const nodeIds = Object.values(snapshot.nodesById).filter(node =>
      (node.kind === 'topic' || node.kind === 'item') && !['settings-a', 'settings-b'].includes(node.id)).map(node => node.id);
    if (nodeIds.length) await window.electronAPI.invoke('soft_delete_nodes', { nodeIds, deletedAt: new Date().toISOString() });
    const isolated = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const live = Object.values(isolated.nodesById).filter(node =>
      (node.kind === 'topic' || node.kind === 'item') && !isolated.trashedNodeIds.includes(node.id)).map(node => node.id).sort();
    if (JSON.stringify(live) !== JSON.stringify(['settings-a', 'settings-b'])) throw new Error(`Unexpected learning fixture: ${live}`);
  });
  await resetDailyFlowGeneration(desktopApp);
  await page.evaluate(() => window.electronAPI.invoke('open_daily_flow', { now: new Date().toISOString(),
    mode: 'reading-only', preferredNodeId: 'settings-b', prepareOnly: true }));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('settings-b');
  const before = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await page.locator('[data-node-id="settings-source"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Enable Sequential Reading', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getNode('settings-b')?.reading?.state)).toBe('locked');
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('settings-a');
  const after = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(after.readTopicCount).toBe(before.readTopicCount);
  expect(after.totalNodeCount).toBe(before.totalNodeCount);
  const saved = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(saved.nodesById['settings-source']?.sequentialReadingEnabled).toBe(true);
  expect(saved.nodesById['settings-b']?.reading?.state).toBe('locked');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'saved.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe('settings-a');
  const restored = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(restored.readTopicCount).toBe(before.readTopicCount);
  await page.screenshot({ path: path.join(output, 'restored.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before, after, restored }, null, 2));
});

import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('shows a scoped committed title and body while keeping the selected article through reload', async ({ desktopApp, desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'projection-topic', kind: 'topic', title: 'Before projection', content: 'Before readable body' },
      { id: 'projection-other', kind: 'topic', title: 'Unrelated article', content: 'Unrelated body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('projection-topic'));
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Before readable body');
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
    const node = snapshot.nodesById['projection-topic']!;
    await window.electronAPI.invoke('update_node_content', { ...node, nodeId: node.id,
      title: 'After projection', isTitleManual: true, content: 'After readable body',
      anchorLink: node.anchorLink ?? null, position: node.position ?? null, updatedAt: new Date().toISOString() });
  });
  await desktopApp.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { currentLibraryScope } = require(`${process.cwd()}/dist/electron/database/attachmentResourceDescription.js`);
    const { notifyWorkspaceSyncApplied } = require(`${process.cwd()}/dist/electron/sync/workspaceSyncAppliedEvents.js`);
    notifyWorkspaceSyncApplied({ appliedNodeIds: ['projection-topic'], appliedObjectIds: ['projection-topic'],
      appliedReviewOpIds: [], libraryScope: currentLibraryScope(),
      workspaceScope: { kind: 'nodes', nodeIds: ['projection-topic'] } });
  });
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('After readable body');
  await expect(page.locator('[data-node-id="projection-topic"]').first()).toContainText('After projection');
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe('projection-topic');
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('projection-topic'));
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('After readable body');
  await expect(page.locator('[data-node-id="projection-other"]').first()).toContainText('Unrelated article');
  await testInfo.attach('scoped-sync-presentation', { body: await page.screenshot({
    path: path.resolve('.tmp/artifacts/T561/scoped-sync-presentation.png') }), contentType: 'image/png' });
});

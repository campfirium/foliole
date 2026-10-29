import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('keeps the displayed article while a sync completion rebuilds unseen work', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b'].map(id => ({ id: `rebuild-${id}`,
      kind: 'topic', title: `Rebuild ${id}`, content: `Readable body ${id}`, createdAt: '2026-01-01T00:00:00.000Z' })), { persist: true });
  });
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toMatch(/^rebuild-/);
  const before = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await addSyncedTopic(page, desktopApp);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().daily!.revision))
    .toBeGreaterThan(before.daily!.revision);
  const after = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(after.currentNodeId).toBe(before.currentNodeId);
  expect(after.readTopicCount).toBe(before.readTopicCount);
  expect(after.cycle!.remaining).toBeGreaterThan(before.cycle!.remaining);
  const view = await page.evaluate(() => window.electronAPI.invoke('read_daily_flow_view', {
    now: new Date().toISOString(), mode: 'recommended', includeEntries: true }));
  expect(view.status === 'ready' && view.nodeIds?.includes('rebuild-new')).toBe(true);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId))
    .not.toBe(before.currentNodeId);
  if ((await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession())).currentNodeId !== 'rebuild-new') {
    const previous = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
    await page.getByRole('button', { name: 'Read', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).not.toBe(previous);
  }
  expect((await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession())).currentNodeId).toBe('rebuild-new');
  const output = path.resolve('.tmp/artifacts/T628/native');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'after-read.png') });
  const advanced = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().readTopicCount))
    .toBe(advanced.readTopicCount);
});

async function addSyncedTopic(page: Page, desktopApp: DesktopSession['electronApp']) {
  await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot');
    const stamp = new Date().toISOString();
    await window.electronAPI.invoke('create_topic', { nodeId: 'rebuild-new', kind: 'topic', parentNodeId: null,
      title: 'New synced article', content: 'New synced readable body', isTitleManual: true, reveal: null,
      anchorLink: null, position: null, createdAt: stamp, updatedAt: stamp, nodeOrder: [...snapshot.nodeOrder, 'rebuild-new'] });
  });
  await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const databasePath = await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().dbPath);
    const { currentLibraryScope } = require(`${process.cwd()}/dist/electron/database/attachmentResourceDescription.js`);
    const { notifyWorkspaceSyncApplied } = require(`${process.cwd()}/dist/electron/sync/workspaceSyncAppliedEvents.js`);
    const libraryScope = await connection.runWithDatabaseConnectionOwner(() => currentLibraryScope());
    notifyWorkspaceSyncApplied({ workspaceScope: { kind: 'nodes', nodeIds: ['rebuild-new'], structure: true },
      libraryScope, appliedNodeIds: ['rebuild-new'], appliedObjectIds: ['rebuild-new'], appliedReviewOpIds: [] });
    const { createDesktopRequestSyncDatabaseHost } = require(`${process.cwd()}/dist/electron/sync/desktopRequestSyncDatabaseHost.js`);
    await createDesktopRequestSyncDatabaseHost(databasePath).databaseRoundCompleted();
  });
}

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

function savedSequence(app: DesktopSession['electronApp']) {
  return app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
    const db = connection.openDatabaseConnection().sqlite;
    return { rows: db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all(),
      state: db.prepare('SELECT session_json,invalidated FROM daily_flow_state WHERE id=1').get(),
      pending: db.prepare('SELECT * FROM parent_order_projection_pending').all() };
    });
  });
}

test('keeps the saved sequence after a body edit and advances Read through the original next item', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'c'].map(id => ({
      id: `body-sync-${id}`, kind: 'topic', title: `Body sync ${id}`, content: `Original body ${id}`,
      createdAt: '2026-01-01T00:00:00.000Z'
    })), { persist: true });
  });
  // Isolated fixture setup: the persisted list under test is generated only after all inputs exist.
  await desktopApp.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.transaction((driver: { execute(sql: string): void }) => {
      for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations']) driver.execute(`DELETE FROM ${table}`);
    }));
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const session = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  expect(session.currentNodeId).toBeTruthy();
  const view = await page.evaluate(() => window.electronAPI.invoke('read_daily_flow_view', {
    now: new Date().toISOString(), mode: 'recommended', includeEntries: true
  }));
  if (view.status !== 'ready') throw new Error('Flow is not prepared');
  const next = view.nodeIds![1];
  const before = await savedSequence(desktopApp);
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.updateNodeContent(id!, 'Changed body stays in the same saved sequence'), session.currentNodeId)).toBe(true);
  await expect.poll(() => page.evaluate(async id =>
    (await window.electronAPI.invoke('load_node_document', { nodeId: id! }))?.content, session.currentNodeId))
    .toBe('Changed body stays in the same saved sequence');
  const after = await savedSequence(desktopApp);
  expect(after.rows).toEqual(before.rows);
  expect(after.state).toEqual(before.state);
  expect(after.pending).toEqual(expect.arrayContaining(before.pending));
  expect(after.pending).toHaveLength(before.pending.length);
  expect((await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession())).currentNodeId).toBe(session.currentNodeId);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(next);
  const output = path.resolve('.tmp/artifacts/T613/native');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'after-read.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before, after, next }, null, 2));
});

import { mkdirSync } from 'node:fs';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'alternative-promotion-refresh';
const MAIN = 'Original ordinary body — 原文 😀';
const ALTERNATIVE = 'Selected ordinary body — 完整正文 😀\n\nSecond paragraph.';

async function seedAlternative(app: ElectronApplication, page: Page) {
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug!.seedNodes!([
      { id, content, kind: 'topic', title: 'Alternative refresh' }
    ], { persist: true });
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: id, content, kind: 'topic', title: 'Alternative refresh', parentNodeId: null,
      anchorLink: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      desiredRetention: null, hideTitleHeading: false, imageRegions: null, isTitleManual: true,
      position: 1, priority: null, reading: null, reveal: null, review: null, virtualFilter: null
    });
  }, { id: ID, content: MAIN });
  await app.evaluate(async (_, { id, content }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { upsertTextBodyBlob } = require(`${process.cwd()}/dist/lib/core/database/contentBodyBlobs.js`);
    await new Promise<void>(resolve => setImmediate(resolve));
    connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite, driver, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('.tmp') && !dbPath.includes('foliole-playwright')) throw new Error('isolated_library_required');
      const row = sqlite.prepare(`SELECT v.* FROM nodes n JOIN node_sync_versions v
        ON v.version_id = n.current_version_id WHERE n.id = ?`).get(id);
      const now = new Date().toISOString();
      const hash = upsertTextBodyBlob(driver, content, now);
      const snapshot = JSON.parse(row.snapshot_json);
      snapshot.text_alternative_bodies = [{ hash, text: content }];
      snapshot.text_alternatives = [{ id: 'ordinary-alternative', body_blob_hash: hash,
        source_host_name: 'Other device', created_at: now,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }];
      sqlite.prepare('UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?')
        .run(JSON.stringify(snapshot), row.version_id);
    });
  }, { id: ID, content: ALTERNATIVE });
  await page.evaluate(async id => {
    await window.__folioleWorkspaceDebug!.openNode!('special-inbox');
    await window.__folioleWorkspaceDebug!.openNode!(id);
  }, ID);
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible().catch(() => false)) await exitFlow.click();
}

test('adopting an ordinary alternative updates the originating editor without reopening', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedAlternative(desktopApp, page);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(MAIN);
  await page.getByRole('button', { name: /Alternative bodies \(1\)|备选正文.*1/ }).click();
  const dialog = page.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.cm-content')).toContainText([MAIN, 'Selected ordinary body']);
  await dialog.getByRole('button', { name: /Set as body|设为正文/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await loadNodeDocument(page, ID))?.content).toBe(ALTERNATIVE);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Selected ordinary body');
  await expect(page.getByRole('button', { name: /Alternative bodies \(1\)|备选正文.*1/ })).toBeHidden();
  mkdirSync('.tmp/artifacts/T618', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T618/ordinary-promoted.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async id => window.__folioleWorkspaceDebug!.openNode!(id), ID);
  await expect.poll(async () => (await loadNodeDocument(page, ID))?.content).toBe(ALTERNATIVE);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Selected ordinary body');
});

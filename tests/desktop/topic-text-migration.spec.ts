import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'legacy-text-migration';
const MAIN = 'Original main text before legacy conversion.';
const ALTERNATIVE = 'Complete legacy alternative — 原文 😀';

async function convertLegacyAlternative(desktopApp: ElectronApplication, page: Page) {
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug!.seedNodes!([
      { id, content, kind: 'topic', title: 'Legacy text migration' }
    ], { persist: true });
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: id, content, kind: 'topic', title: 'Legacy text migration', parentNodeId: null,
      anchorLink: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      desiredRetention: null, hideTitleHeading: false, imageRegions: null, isTitleManual: true,
      position: 1, priority: null, reading: null, reveal: null, review: null, virtualFilter: null
    });
  }, { id: ID, content: MAIN });
  const result = await desktopApp.evaluate(async (_, { id, alternative }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const registry = require(`${process.cwd()}/dist/lib/core/database/numberedMigrationLatestRegistry.js`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('.tmp') && !dbPath.includes('foliole-playwright')) throw new Error('isolated_library_required');
      const now = new Date().toISOString();
      sqlite.prepare(`INSERT INTO node_text_alternatives VALUES
        ('legacy-native', ?, 'legacy-native-source', ?, 'Legacy host', ?, 'available', ?)`)
        .run(id, alternative, now, now);
      const before = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(id);
      sqlite.transaction(() => registry.LATEST_NUMBERED_SCHEMA_MIGRATIONS.find((step: { version: number }) => step.version === 147).migrate(sqlite))();
      const row = sqlite.prepare('SELECT v.* FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?').get(id);
      return { before, parent: row.parent_version_id, body: row.body_text,
        snapshot: JSON.parse(row.snapshot_json),
        retired: sqlite.prepare('SELECT body_text, status FROM node_text_alternatives WHERE alternative_id = ?').get('legacy-native') };
    });
  }, { id: ID, alternative: ALTERNATIVE });
  expect(result.parent).toBe(result.before);
  expect(result.body).toBe(MAIN);
  expect(result.snapshot.text_selection.version_id).toBe(result.before);
  expect(result.retired).toEqual({ body_text: '', status: 'superseded' });
}

test('reads, promotes and reloads an alternative produced by the numbered migration', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await convertLegacyAlternative(desktopApp, page);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async (id) => window.__folioleWorkspaceDebug!.openNode!(id), ID);
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible().catch(() => false)) await exitFlow.click();
  const preview = () => page.evaluate(async (id) =>
    window.electronAPI!.invoke('load_node_text_alternative_preview', { node_id: id }), ID);
  await expect.poll(preview).toMatchObject({ current_content: MAIN,
    updated_content: ALTERNATIVE, alternatives: [{ source_host_name: 'Legacy host' }] });
  await page.getByRole('button', { name: /Alternative bodies \(1\)|备选正文.*1/ }).click();
  const dialog = page.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.cm-content')).toContainText([MAIN, ALTERNATIVE]);
  mkdirSync('.tmp/artifacts/T615', { recursive: true });
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T615/migrated-alternative.png') });
  await dialog.getByRole('button', { name: /Set as body|设为正文/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await loadNodeDocument(page, ID))?.content).toBe(ALTERNATIVE);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(ALTERNATIVE);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T615/promoted-alternative.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async (id) => window.__folioleWorkspaceDebug!.openNode!(id), ID);
  await expect.poll(async () => (await loadNodeDocument(page, ID))?.content).toBe(ALTERNATIVE);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(ALTERNATIVE);
});

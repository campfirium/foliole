import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { ElectronApplication } from '@playwright/test';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const RULE = 'cleanup-native-readwise';
const AT = '2026-10-02T00:00:00.000Z';
const BODY = 'Preserved user body after Readwise cleanup.';
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/readwise-cleanup-cache-lifecycle');

async function invokeWhenAvailable<T>(execute: () => Promise<T>): Promise<T> {
  let result: T | undefined;
  await expect.poll(async () => {
    try {
      result = await execute();
      return true;
    } catch (error) {
      if (!String(error).includes('sqlite connection is owned')) throw error;
      return false;
    }
  }, { timeout: 30_000 }).toBe(true);
  if (result === undefined) throw new Error('Desktop command returned no result');
  return result;
}

async function seedFixture(app: ElectronApplication, primaryPath: string) {
  return app.evaluate((_electron, fixture) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (file: string) => require(pathApi.join(process.cwd(), 'dist', file));
    const connection = load('electron/database/connection.js');
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      load('electron/import/importManagerSettings.js').saveImportManagerSettings({
        readwiseRootPath: pathApi.dirname(fixture.primaryPath), readwiseSourceMode: 'relay',
        readwiseSources: [{ id: fixture.rule, kind: 'articles', primaryPath: fixture.primaryPath,
          highlightPath: '', highlightMode: 'split', keepState: 'enabled' }]
      });
      load('electron/database/readwiseHostAssignment.js').activateReadwiseOnThisHost();
      const order = load('lib/core/database/nodeOrderMutations.js');
      for (const [id, parent, content, at] of [
        ['cleanup-kept', 'special-inbox', fixture.body, fixture.at],
        ['cleanup-addition', 'cleanup-kept', 'User addition.', '2026-10-02T00:00:02.000Z'],
        ['cleanup-deleted', 'special-inbox', 'Imported plain body.', fixture.at]
      ]) {
        db.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
          VALUES (?, ?, 'topic', ?, ?, ?, ?)`).run(id, parent, id, content, at, at);
        order.ensureNodeParentMembership(connection.openDatabaseConnection().driver, id);
      }
      const items = load('electron/database/keepImportItems.js');
      const cache = load('electron/database/keepImportItemCache.js');
      for (const [rule, source, node, missing] of [
        [fixture.rule, 'tracking-only.md', null, false],
        [fixture.rule, 'detached.md', 'cleanup-kept', false],
        [fixture.rule, 'deleted.md', 'cleanup-deleted', false],
        [fixture.rule, 'missing.md', 'missing-node', true],
        ['other-rule', 'tracking-only.md', null, false]
      ]) {
        items.upsertKeepImportItem({ ruleId: rule, sourcePath: source, lastNodeId: node, hasSourceUpdate: false,
          firstSeenAt: fixture.at, lastSeenAt: fixture.at, lastImportedAt: fixture.at,
          sourceState: missing ? 'missing' : 'present', localNodeState: missing ? 'locally_deleted' : 'active',
          lastStatus: 'imported', sourceMtimeMs: 1, sourceSizeBytes: 1 });
        cache.upsertKeepImportItemCache({ ruleId: rule, sourcePath: source, title: source,
          content: 'Readable cached source.', contentPreview: 'Cached source preview.',
          refreshedAt: fixture.at, sourceMtimeMs: 1, sourceSizeBytes: 1 });
      }
      return connection.openDatabaseConnection().dbPath;
    });
  }, { primaryPath, rule: RULE, at: AT, body: BODY });
}

function readPersistentFacts(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      cache: db.prepare('SELECT rule_id, source_path, content FROM keep_import_item_cache ORDER BY rule_id, source_path').all(),
      tracking: db.prepare('SELECT rule_id, source_path, last_node_id, source_state, local_node_state FROM keep_import_items ORDER BY rule_id, source_path').all(),
      nodes: db.prepare("SELECT id, content FROM nodes WHERE id LIKE 'cleanup-%' ORDER BY id").all()
    };
  } finally { db.close(); }
}

test('Readwise cleanup preserves user content and Removed cache while deleting detached and tracking-only pairs', async ({ desktopSession }) => {
  const page = desktopSession.firstWindow;
  await expectWorkspaceShell(page);
  const stateRoot = desktopSession.target.runtimeStateRoot;
  const primaryPath = path.join(stateRoot, 'readwise', 'Articles');
  await mkdir(primaryPath, { recursive: true });
  const databasePath = await seedFixture(desktopSession.electronApp, primaryPath);
  expect(path.relative(stateRoot, databasePath).startsWith('..')).toBe(false);
  const before = readPersistentFacts(databasePath);
  const preview = await invokeWhenAvailable(() => page.evaluate(() => window.electronAPI.invoke('preview_readwise_import_cleanup')));
  expect(preview).toMatchObject({ delete_count: 1, keep_count: 1, tracking_only_count: 1 });
  const result = await invokeWhenAvailable(() => page.evaluate(() => window.electronAPI.invoke('run_readwise_import_cleanup')));
  expect(result).toMatchObject({ status: 'completed', deleted_count: 1, detached_count: 1 });
  const removed = await invokeWhenAvailable(() => page.evaluate(() => window.electronAPI.invoke('load_removed_sources')));
  expect(removed.entries).toEqual([expect.objectContaining({
    rule_id: RULE, source_path: 'deleted.md', content: 'Readable cached source.'
  })]);
  const after = readPersistentFacts(databasePath);
  const retained = (row: Record<string, unknown>) => row.rule_id !== RULE || !['tracking-only.md', 'detached.md'].includes(String(row.source_path));
  expect(after.cache).toEqual(before.cache.filter(retained));
  expect(after.tracking).toEqual([
    expect.objectContaining({ rule_id: RULE, source_path: 'deleted.md', local_node_state: 'locally_deleted' }),
    expect.objectContaining({ rule_id: RULE, source_path: 'missing.md', source_state: 'missing' }),
    expect.objectContaining({ rule_id: 'other-rule', source_path: 'tracking-only.md', last_node_id: null })
  ]);
  expect(after.nodes).toEqual(before.nodes.filter((row) => row.id !== 'cleanup-deleted'));
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('cleanup-kept')))
    .toBe(true);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(BODY);
  await closeDesktopApplication(desktopSession.electronApp);
  expect(readPersistentFacts(databasePath)).toEqual(after);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACT_DIR, 'runtime-facts.json'), JSON.stringify({ databasePath, preview, result, removed, before, after }, null, 2));
});

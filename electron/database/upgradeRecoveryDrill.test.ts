// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let libraryRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: path.join(libraryRoot, 'app-data'),
    app_cache_dir: path.join(libraryRoot, 'cache'),
    app_config_dir: path.join(libraryRoot, 'config'),
    app_log_dir: path.join(libraryRoot, 'logs'),
    documents_dir: path.join(libraryRoot, 'Documents')
  })
}));

import { seedBackupBaseline } from './backupRestore.fixture.js';
import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';
const assetBytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('isolated image bytes')]);
const assetName = `${createHash('sha256').update(assetBytes).digest('hex')}.jpg`;
const childContent = `Protected child body\n\n![image](asset://${assetName})`;
afterEach(async () => {
  closeDatabaseConnection();
  await waitForManagedSafetySnapshotSettlements();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

it('restores production backup into a new isolated library and retains semantic facts after cold restart', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t286-'));
  libraryRoot = path.join(tempRoot, 'source');
  initializeDatabase();
  seedBackupBaseline();
  upsertNodeSnapshot({
    nodeId: 'drill-child', parentNodeId: 'node-root', kind: 'topic', title: 'Child',
    isTitleManual: true, content: childContent, reveal: null, anchorLink: null,
    position: 0, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z'
  });
  saveJsonSetting('search_aliases_document', { terms: ['protected'] });
  const sourceAsset = path.join(libraryRoot, 'Documents', 'Foliole', 'Assets', assetName);
  await fs.mkdir(path.dirname(sourceAsset), { recursive: true });
  await fs.writeFile(sourceAsset, assetBytes);
  const backup = await createApplicationDatabaseBackup();
  closeDatabaseConnection();
  await waitForManagedSafetySnapshotSettlements();

  libraryRoot = path.join(tempRoot, 'target');
  await expect(fs.access(libraryRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  initializeDatabase();
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  assertRestoredFacts();
  closeDatabaseConnection();
  initializeDatabase();
  assertRestoredFacts();
  await expect(fs.readFile(sourceAsset)).resolves.toEqual(assetBytes);
  await expect(fs.access(path.join(libraryRoot, 'Documents', 'Foliole', 'Assets', assetName)))
    .rejects.toMatchObject({ code: 'ENOENT' });
});

function assertRestoredFacts() {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  expect(snapshot?.nodesById['node-root']).toMatchObject({ content: '# root' });
  expect(snapshot?.nodesById['drill-child']).toMatchObject({
    content: childContent, parentNodeId: 'node-root', kind: 'topic'
  });
  expect(snapshot?.nodesById['node-qa']).toMatchObject({
    content: 'Prompt [...]', reveal: 'Answer', review: { reps: 1, stability: 2.7 }
  });
  expect(snapshot?.trashedNodeIds).toContain('node-trash');
  expect(loadJsonSetting('search_aliases_document')).toEqual({ terms: ['protected'] });
  const sqlite = openDatabaseConnection().sqlite;
  expect(sqlite.prepare("SELECT COUNT(*) AS count FROM review_log WHERE node_id = 'node-qa'").get())
    .toEqual({ count: 1 });
  expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
}

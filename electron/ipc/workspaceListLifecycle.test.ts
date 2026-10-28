// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
  app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot as loadSharedList } from '../../lib/core/database/workspaceListSnapshot.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadWorkspaceListSnapshot } from '../database/workspaceListSnapshot.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { handleWorkspaceReadCommand } from './storageReadCommands.js';

const timestamp = '2026-10-28T00:00:00.000Z';
const lifecycle = { checkedAt: timestamp, connectionRef: 'fixture', export: 'deleted', reader: 'missing',
  scope: { readerLocation: 'all', version: 1 } };

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-list-lifecycle-'));
  initializeDatabase();
  resetSeededWorkspace();
  for (const nodeId of ['linked', 'unlinked']) {
    upsertNodeSnapshot({ nodeId, parentNodeId: null, kind: 'topic', title: nodeId,
      isTitleManual: true, content: 'Preserved local body', reveal: null, anchorLink: null,
      position: 0, createdAt: timestamp, updatedAt: timestamp });
  }
  openDatabaseConnection().driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator,
    first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
    remote_provider, remote_import_state_json
  ) VALUES ('source', 'fixture', 'document', 'fixture', 'fixture', ?, ?, 'fixture', 'linked', 'readwise', ?)`,
  [timestamp, timestamp, JSON.stringify({ remoteLifecycle: lifecycle })]);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readDesktop(mode: 'full' | 'scoped') {
  return handleWorkspaceReadCommand(mode === 'full'
    ? NATIVE_COMMANDS.loadWorkspaceListSnapshot : NATIVE_COMMANDS.loadWorkspaceListProjection,
  mode === 'full' ? {} : { nodeIds: ['linked', 'unlinked'], structure: false,
    libraryScope: currentLibraryScope() }) as ReturnType<typeof loadWorkspaceListSnapshot>;
}

it.each(['full', 'scoped'] as const)('omits empty lifecycle from the %s desktop list without losing list facts', mode => {
  const driver = openDatabaseConnection().driver;
  const shared = mode === 'full' ? loadSharedList(driver)!
    : loadWorkspaceListProjection(driver, { nodeIds: ['linked', 'unlinked'], structure: false });
  const desktop = readDesktop(mode);
  for (const id of ['linked', 'unlinked']) {
    const expected = { ...shared.nodesById[id]! };
    expect(expected.readwiseRemoteLifecycle).toBeNull();
    delete expected.importContentFingerprint;
    delete expected.importSourceFingerprint;
    delete expected.readwiseRemoteLifecycle;
    delete expected.resourceReferences;
    expect(desktop.nodesById[id]).toEqual(expected);
    expect(desktop.nodesById[id]).not.toHaveProperty('readwiseRemoteLifecycle');
  }
});

it('preserves nonempty source lifecycle, full snapshots and local bodies after desktop reads and reopen', () => {
  const { driver } = openDatabaseConnection();
  const before = driver.queryAll('SELECT * FROM import_sources');
  for (const mode of ['full', 'scoped'] as const) readDesktop(mode);
  expect(driver.queryAll('SELECT * FROM import_sources')).toEqual(before);
  for (const includeBody of [false, true]) {
    const snapshot = loadWorkspaceSnapshot({ includeBody })!;
    expect(snapshot.nodesById.linked?.readwiseRemoteLifecycle).toEqual(lifecycle);
    expect(snapshot.nodesById.unlinked?.readwiseRemoteLifecycle).toBeNull();
    expect(snapshot.nodesById.linked?.content).toBe(includeBody ? 'Preserved local body' : '');
  }
  closeDatabaseConnection();
  expect(readDesktop('full').nodesById.linked?.title).toBe('linked');
  expect(loadWorkspaceSnapshot()?.nodesById.linked?.readwiseRemoteLifecycle).toEqual(lifecycle);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM import_sources')).toEqual(before);
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

const timestamp = '2026-10-03T00:00:00.000Z';
const lifecycle = { checkedAt: timestamp, connectionRef: 'fixture', export: 'present', reader: 'present',
  scope: { readerLocation: 'all', version: 1 } };

function metadata(patch: Partial<typeof lifecycle> = {}) {
  return JSON.stringify({ remoteLifecycle: { ...lifecycle, ...patch } });
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-snapshot-lifecycle-'));
  initializeDatabase();
  for (const nodeId of ['first', 'second', 'unlinked']) {
    upsertNodeSnapshot({ nodeId, parentNodeId: null, kind: 'topic', title: nodeId,
      isTitleManual: true, content: 'Preserved body', reveal: null, anchorLink: null,
      position: 0, createdAt: timestamp, updatedAt: timestamp });
  }
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function source(id: string, nodeId: string | null, date: string, metadata: string, provider = 'readwise') {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator,
    first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
    remote_provider, remote_import_state_json
  ) VALUES (?, 'fixture', 'document', 'fixture', 'fixture', ?, ?, 'fixture', ?, ?, ?)`)
    .run(id, timestamp, date, nodeId, provider, metadata);
}

it('loads only the latest Readwise lifecycle per node without multiplying snapshot rows', () => {
  source('old', 'first', '2026-10-01', metadata({ reader: 'missing' }));
  source('latest', 'first', '2026-10-02', metadata());
  source('other-provider', 'first', '2026-10-03', metadata({ reader: 'missing' }), 'other');
  source('second-source', 'second', '2026-10-01', metadata({ export: 'deleted' }));
  for (const includeBody of [false, true]) {
    const snapshot = loadWorkspaceSnapshot({ includeBody })!;
    expect(snapshot.nodesById.first?.readwiseRemoteLifecycle).toEqual(lifecycle);
    expect(snapshot.nodesById.second?.readwiseRemoteLifecycle).toEqual({ ...lifecycle, export: 'deleted' });
    expect(snapshot.nodesById.unlinked?.readwiseRemoteLifecycle).toBeNull();
    expect(snapshot.nodeOrder.filter((id) => id === 'first')).toHaveLength(1);
    expect(snapshot.nodesById.first?.content).toBe(includeBody ? 'Preserved body' : '');
  }
});

it('keeps source rows unchanged and preserves lifecycle after reopening', () => {
  source('old', 'first', '2026-10-01', metadata({ reader: 'missing' }));
  source('unlinked', null, '2026-10-03', metadata({ reader: 'missing' }));
  source('latest', 'first', '2026-10-02', metadata());
  const before = openDatabaseConnection().sqlite.prepare('SELECT * FROM import_sources').all();
  const snapshot = loadWorkspaceSnapshot()!;
  expect(snapshot.nodesById.first?.readwiseRemoteLifecycle).toEqual(lifecycle);
  expect(openDatabaseConnection().sqlite.prepare('SELECT * FROM import_sources').all()).toEqual(before);
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadWorkspaceSnapshot()?.nodesById.first?.readwiseRemoteLifecycle).toEqual(lifecycle);
});

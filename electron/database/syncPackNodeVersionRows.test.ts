import { expect, it, vi } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type {
  SyncPackNodeVersionParentRow,
  SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import {
  loadSyncPackNodeVersionParentRows,
  loadSyncPackNodeVersionRows
} from './syncPackNodeVersionRows.js';

function createVersion(overrides: Partial<SyncPackNodeVersionRow> = {}): SyncPackNodeVersionRow {
  return {
    body_text: null,
    content_hash: 'node-hash',
    created_at: '2026-07-27T00:00:00.000Z',
    host_name: 'desktop',
    object_id: 'node-1',
    parent_version_id: null,
    snapshot_json: '{"id":"node-1"}',
    version_id: 'desktop#head',
    ...overrides
  };
}

function createDriver(args: {
  parentRows?: SyncPackNodeVersionParentRow[];
  versions: SyncPackNodeVersionRow[];
}): DatabaseDriver {
  return {
    execute: vi.fn(),
    prepare: vi.fn(),
    queryAll: vi.fn(() => args.parentRows ?? []),
    queryOne: vi.fn((_sql: string, params?: readonly unknown[]) => (
      args.versions.find((row) => row.version_id === params?.[0])
    )),
    transaction: vi.fn()
  } as unknown as DatabaseDriver;
}

it('packs current head lineage references without requiring missing historical parents', () => {
  const head = createVersion({ parent_version_id: 'desktop#missing-parent' });
  const driver = createDriver({
    versions: [head],
    parentRows: [{ ordinal: 0, parent_version_id: 'desktop#missing-parent', version_id: 'desktop#head' }]
  });

  const versions = loadSyncPackNodeVersionRows(driver, [{
    current_version_id: 'desktop#head',
    id: 'node-1'
  } as never]);

  expect(versions).toEqual([head]);
  expect(loadSyncPackNodeVersionParentRows(driver, versions)).toEqual([]);
});

it('keeps only pack-internal parent edges for the same node object', () => {
  const parent = createVersion({ parent_version_id: null, version_id: 'desktop#parent' });
  const head = createVersion({ parent_version_id: 'desktop#parent' });
  const rows = [{ ordinal: 0, parent_version_id: 'desktop#parent', version_id: 'desktop#head' }];

  expect(loadSyncPackNodeVersionParentRows(createDriver({ versions: [], parentRows: rows }), [parent, head]))
    .toEqual(rows);
  expect(() => loadSyncPackNodeVersionParentRows(createDriver({ versions: [], parentRows: rows }), [
    { ...parent, object_id: 'other-node' },
    head
  ])).toThrow('sync_pack_node_version_cross_object:desktop#head');
});

it('still rejects a missing current head row', () => {
  const driver = createDriver({ versions: [] });

  expect(() => loadSyncPackNodeVersionRows(driver, [{
    current_version_id: 'desktop#missing-head',
    id: 'node-1'
  } as never])).toThrow('sync_pack_node_version_missing:desktop#missing-head');
});

// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { GraphNodeVersionAncestry } from '../../lib/core/sync/nodeVersionAncestry.js';
import { requestSyncNodeSource } from '../../lib/core/sync/requestSyncNodeGraph.js';
import { applyConvergentSyncNodeSource } from '../../lib/core/sync/syncNodeConvergence.js';
import { arraySyncNodeRecordSource } from '../../lib/core/sync/syncNodeRecordSource.js';

import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const device of devices.splice(0)) device.sqlite.close(); vi.useRealTimers(); });
function device() { const host = textDevice(); devices.push(host); return host; }

function businessRows(host: ReturnType<typeof textDevice>) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'node_text_alternatives',
    'sync_object_state', 'content_blob_data'].map(table => ({ table,
    rows: host.sqlite.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row)).sort() }));
}

it.each(['cycle', 'cross-object parent', 'changed immutable hash'] as const)(
  'rejects %s through request receive without changing business rows', async fault => {
    const host = device();
    const base = textBranch('base', 'Original');
    await host.receive([base]);
    const before = businessRows(host);
    const valid = textBranch('independent', 'Independent body');
    valid.object_id = 'independent'; valid.snapshot = { ...valid.snapshot, id: 'independent' };
    const invalid = fault === 'changed immutable hash' ? { ...base, content_hash: 'f'.repeat(64) } :
      textBranch('invalid', 'Invalid body', base);
    if (fault === 'cycle') {
      invalid.parent_version_id = 'invalid'; invalid.parent_version_ids = ['invalid'];
    } else if (fault === 'cross-object parent') {
      invalid.object_id = 'different'; invalid.snapshot = { ...invalid.snapshot, id: 'different' };
    }
    const expected = fault === 'cycle' ? 'node_version_graph_cycle' : fault === 'cross-object parent'
      ? 'node_version_cross_object_parent:base' : 'sync_pack_node_version_immutable_mismatch';
    await expect(host.db.transaction(async tx => {
      const source = await requestSyncNodeSource(tx, arraySyncNodeRecordSource([valid, invalid]));
      await applyConvergentSyncNodeSource(tx, source);
    })).rejects.toThrow(expected);
    expect(businessRows(host)).toEqual(before);
    expect((await host.current()).body_text).toBe('Original');
  });

it('matches ordinary apply and conflict alternatives without per-record ancestor arrays', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-04T00:00:00Z');
  const host = device();
  const reference = device();
  const base = textBranch('base', 'Original', undefined, '2026-10-01T00:00:00Z');
  const local = textBranch('local', 'Local changes', base, '2026-10-02T00:00:00Z');
  const remote = textBranch('remote', 'Remote changes', base, '2026-10-03T00:00:00Z');
  for (const target of [host, reference]) await target.receive([base, local]);
  const expected = await reference.receive([remote]);
  const source = await requestSyncNodeSource(host.db, arraySyncNodeRecordSource([
    { ...remote, ancestor_version_ids: [] }
  ]));
  expect(source.records[0]?.ancestor_version_ids).toBeInstanceOf(GraphNodeVersionAncestry);
  await applyConvergentSyncNodeSource(host.db, source);
  const actual = await host.current();
  expect(actual.version_id).toBe(expected.version_id);
  expect(actual.parent_version_ids).toEqual(expected.parent_version_ids);
  expect(actual.body_text).toBe(expected.body_text);
  expect(wholeBodies(actual)).toEqual(wholeBodies(expected));
});

it('accepts a version whose reclaimed parent is absent, without inventing that parent', async () => {
  const host = device();
  const base = textBranch('base', 'Original');
  const head = textBranch('head', 'Current', base);
  await host.db.transaction(async tx => {
    const source = await requestSyncNodeSource(tx, arraySyncNodeRecordSource([head]));
    await applyConvergentSyncNodeSource(tx, source);
  });
  expect(await host.db.query('SELECT version_id FROM node_sync_versions')).toEqual([{ version_id: 'head' }]);
  expect((await host.current()).version_id).toBe('head');
  expect((await host.current()).body_text).toBe('Current');
});

it('rejects changed parents for an existing immutable version', async () => {
  const host = device();
  const base = textBranch('base', 'Original');
  await host.receive([base]);
  await expect(requestSyncNodeSource(host.db, arraySyncNodeRecordSource([
    { ...base, parent_version_id: 'other', parent_version_ids: ['other'] }
  ]))).rejects.toThrow('node_version_parent_identity_mismatch:base');
  expect((await host.current()).version_id).toBe('base');
});

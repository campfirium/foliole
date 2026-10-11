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

it('rejects missing parents before retaining any incoming object facts', async () => {
  const host = device();
  const base = textBranch('base', 'Original');
  const head = textBranch('head', 'Current', base);
  await expect(host.db.transaction(async tx => {
    const source = await requestSyncNodeSource(tx, arraySyncNodeRecordSource([head]));
    await applyConvergentSyncNodeSource(tx, source);
  })).rejects.toThrow('node_version_missing_parents:base');
  expect(await host.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
  expect(await host.db.query('SELECT id FROM nodes')).toEqual([]);
  const complete = await requestSyncNodeSource(host.db, arraySyncNodeRecordSource([base, head]));
  await applyConvergentSyncNodeSource(host.db, complete);
  expect((await host.current()).version_id).toBe('head');
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

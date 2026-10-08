// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { textBranch, textDevice, wholeBodies } from '../../../electron/database/topicTextState.testSupport.js';
import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { stageFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { framedSyncNodeRecordSource } from './framedSyncNodeRecordSource.js';
import { applySyncNodeSourceWithDbPort } from './syncNodeApplyExecutor.js';
import { applyConvergentSyncNodeSource } from './syncNodeConvergence.js';

const now = '2026-10-08T00:00:00.000Z';
const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => { hosts.splice(0).forEach((host) => host.sqlite.close()); vi.useRealTimers(); });

async function prepare(host: ReturnType<typeof textDevice>, records: NativeSyncNodeRecord[]) {
  const facts = [];
  for (const record of records) {
    const projection = projectFramedSyncNodeRecord(record);
    const fact = projection.manifest.facts[0]!;
    await stageFramedSyncFrozenBody(host.db, fact.blobs[0]!, projection.bodyBlob);
    for (const alternative of projection.alternativeBodyBlobs ?? []) {
      await stageFramedSyncFrozenBody(host.db, alternative.blob, alternative.data);
    }
    facts.push(fact);
  }
  return framedSyncNodeRecordSource(facts);
}

it.each(['', '\ufeff中文😀\0后段', 'a'.repeat(1048576)])('applies exact full owned text after obsolete cache is removed', async (body) => {
  const host = textDevice(); hosts.push(host);
  const record = textBranch('original', body, undefined, now);
  const source = await prepare(host, [record]);
  host.sqlite.exec('DROP TABLE content_blob_data');
  expect(await applySyncNodeSourceWithDbPort(host.db, source)).toMatchObject({ appliedIds: ['topic'], conflictNodes: [] });
  expect((await host.current()).body_text === body).toBe(true);
  expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic') === body).toBe(true);
  expect(host.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get('original') === body).toBe(true);
  host.sqlite.exec('DELETE FROM framed_sync_available_blobs');
  expect((await host.current()).body_text === body).toBe(true);
});

it('keeps all conflict parents and the same complete main and alternatives while loading versions separately', async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const host = textDevice(); const reference = textDevice(); hosts.push(host, reference);
  const base = textBranch('base', 'Base', undefined, '2026-10-07T00:00:00.000Z');
  const local = textBranch('local', 'Local', base, '2026-10-07T01:00:00.000Z');
  await host.receive([base, local]); await reference.receive([base, local]);
  const records = Array.from({ length: 12 }, (_, index) => textBranch(`branch-${index.toString().padStart(2, '0')}`,
    `\ufeff中😀\0 ${index}\n` + 'x'.repeat(800000 + index), base, '2026-10-07T02:00:00.000Z'));
  const source = await prepare(host, records);
  const expected = await reference.receive(records);
  expect(source.records.every((record) => !('body_text' in record) && !('content' in record.snapshot))).toBe(true);
  await applyConvergentSyncNodeSource(host.db, source);
  const current = await host.current();
  expect(current.version_id).toBe(expected.version_id);
  expect(current.parent_version_ids).toEqual(expected.parent_version_ids);
  expect(current.body_text === expected.body_text).toBe(true);
  expect(wholeBodies(current)).toEqual(wholeBodies(expected));
  const edges = (device: typeof host) => device.sqlite.prepare(
    'SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  expect(edges(host)).toEqual(edges(reference));
  expect(current.parent_version_ids).toHaveLength(13);
}, 20000);

it('rolls back earlier full writes when a later ready body is missing, then applies the same identities on retry', async () => {
  const host = textDevice(); hosts.push(host);
  const first = textBranch('first', 'First', undefined, now);
  const second = { ...textBranch('second', 'Second', undefined, now), object_id: 'second-topic',
    snapshot: { ...first.snapshot, id: 'second-topic', content: 'Second' } };
  const source = await prepare(host, [first, second]);
  host.sqlite.prepare('DELETE FROM framed_sync_available_blobs WHERE data = ?').run(new TextEncoder().encode('Second'));
  await expect(applySyncNodeSourceWithDbPort(host.db, source)).rejects.toThrow('framed_sync_published_body_unavailable');
  expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
  expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(0);
  await prepare(host, [second]);
  expect(await applySyncNodeSourceWithDbPort(host.db, source)).toMatchObject({ appliedIds: ['topic', 'second-topic'] });
  expect(host.sqlite.prepare('SELECT id, content, current_version_id FROM nodes ORDER BY id').all()).toEqual([
    { id: 'second-topic', content: 'Second', current_version_id: 'second' },
    { id: 'topic', content: 'First', current_version_id: 'first' }
  ]);
});

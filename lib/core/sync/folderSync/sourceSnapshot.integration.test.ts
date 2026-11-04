// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { materializeDesktopSettingRecord } from '../../../../electron/database/desktopSettingMaterializer.js';
import { textBranch } from '../../../../electron/database/topicTextState.testSupport.js';
import { computeSyncContentHash } from '../../database/syncState.js';
import type { DailyFlowResult } from '../../flow/dailyFlowContract.js';
import { recordDailyFlowSync } from '../../flow/dailyFlowSyncRecord.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../review/settings.js';
import { buildCanonicalSettingSyncPayload } from '../canonicalPrivateStatePayload.js';
import { beginSyncGroupLocalAdoption } from '../syncGroupLocalAdoption.js';
import { applyConvergentSyncNodesWithDbPort } from '../syncNodeConvergence.js';
import { applySyncObjectInTransaction } from '../syncObjectApplyExecutor.js';

import { captureFolderSyncSource } from './sourceSnapshot.js';
import { createFolderSourceFixture, inspectStagedObject } from './sourceSnapshot.testSupport.js';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });

async function fixture() {
  const f = await createFolderSourceFixture();
  cleanups.push(f.close);
  return f;
}

it('stages existing protobuf fact and body streams without a peer, then skips unchanged data', async () => {
  const f = await fixture();
  const first = await captureFolderSyncSource({ host: f.host, previous: [] });
  cleanups.push(first.dispose);
  expect(first.objects).toHaveLength(1);
  expect((await inspectStagedObject(f.host, first, first.objects[0]!)).bodies).toContain('First article');
  const next = await captureFolderSyncSource({ host: f.host, previous: first.inventory });
  cleanups.push(next.dispose);
  expect(next.objects).toEqual([]);
  expect(f.sqlite.prepare('SELECT count(*) AS n FROM sync_group_local_state').get()).toEqual({ n: 0 });
});

it('collects inline image and explicit PDF references even when local attachment demand is empty', async () => {
  const f = await fixture();
  const image = `${'a'.repeat(64)}.png`;
  const pdf = `${'b'.repeat(64)}.pdf`;
  const next = textBranch('v2', `![image](asset://${image})`, f.first);
  next.snapshot.resource_references = JSON.stringify([{ storage_key: pdf, role: 'reference', original_name: 'Original.pdf' }]);
  await applyConvergentSyncNodesWithDbPort(f.db, [next]);
  // Initial state: local resources already satisfied. Export must not consume the receiver demand queue.
  f.sqlite.exec('DELETE FROM attachment_pending; DELETE FROM attachment_parse_queue');
  const snapshot = await captureFolderSyncSource({ host: f.host, previous: [] });
  cleanups.push(snapshot.dispose);
  expect(snapshot.resourceKeys).toEqual([image, pdf]);
  expect(f.sqlite.prepare('SELECT count(*) AS n FROM attachment_pending').get()).toEqual({ n: 0 });
  expect(f.sqlite.prepare('SELECT count(*) AS n FROM attachment_parse_queue').get()).toEqual({ n: 0 });
});

it('rejects blocked publication before interpreting an inventory as an empty library', async () => {
  const f = await fixture();
  await beginSyncGroupLocalAdoption(f.db, { endpointUrl: 'http://127.0.0.1:1', groupId: 'pending',
    libraryEpoch: 'epoch', providerDeviceId: 'provider', providerDeviceName: 'Provider', providerPlatform: 'android' });
  await expect(captureFolderSyncSource({ host: f.host, previous: [] }))
    .rejects.toThrow('sync_group_local_adoption_pending');
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('First article');
});

it('keeps one source snapshot when another writer edits between exported objects', async () => {
  const f = await fixture();
  const other = textBranch('other-v1', 'Other before');
  other.object_id = 'other';
  other.snapshot.id = 'other';
  await applyConvergentSyncNodesWithDbPort(f.db, [other]);
  let changed = false;
  const host = { ...f.host, files: { ...f.host.files, async write(key: string, bytes: Uint8Array) {
    await f.host.files.write(key, bytes);
    if (!changed && key.includes('object-0-frame-')) {
      changed = true;
      await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'First after', f.first)]);
    }
  } } };
  const snapshot = await captureFolderSyncSource({ host, previous: [] });
  cleanups.push(snapshot.dispose);
  const topic = snapshot.objects.find(object => object.globalId === 'topic')!;
  expect((await inspectStagedObject(host, snapshot, topic)).bodies).toContain('First article');
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('First after');
  const next = await captureFolderSyncSource({ host, previous: snapshot.inventory });
  cleanups.push(next.dispose);
  expect(next.objects.map(object => object.globalId)).toEqual(['topic']);
  expect((await inspectStagedObject(host, next, next.objects[0]!)).bodies).toContain('First after');
});

it('exports a shared setting through its normal canonical producer rather than a node-only path', async () => {
  const f = await fixture();
  const payload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: '*', key: 'readwise_source_cutover_v2',
    platform: 'android', scope: 'user_space', value_json: '[]' });
  const id = 'user_space:android:phone:*:readwise_source_cutover_v2';
  await f.db.transaction(db => applySyncObjectInTransaction(db, { object_type: 'setting', object_id: id,
    content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: '2026-11-04T00:00:00.000Z' },
  { hostName: 'Source', onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
  const snapshot = await captureFolderSyncSource({ host: f.host, previous: [] });
  cleanups.push(snapshot.dispose);
  const object = snapshot.objects.find(value => value.objectType === 'setting')!;
  expect(object.globalId).toBe(id);
  expect((await inspectStagedObject(f.host, snapshot, object)).facts).toHaveLength(1);
});

it('preserves the existing independent daily-flow table stream without treating it as ordinary facts', async () => {
  const f = await fixture();
  const now = '2026-11-04T08:00:00.000Z';
  const settings = { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
    dayWindow: { start: '2026-11-04T04:00:00.000Z', end: '2026-11-05T04:00:00.000Z' } };
  const value: DailyFlowResult = { mode: 'recommended', session: {
    flowFormat: 'cycle-v1', cycle: { clearKey: 0, clearedAt: null, scanAfter: 0,
      lapLimit: 1, tailKey: 1, remaining: 1, reviewRemaining: 0 },
    currentNodeId: 'topic', isAnswerRevealed: false, queueNodeIds: ['topic'], totalNodeCount: 1,
    daily: { scope: 'source', dayKey: settings.dayWindow.start, revision: 1 }
  } };
  await f.db.transaction(db => recordDailyFlowSync(db, value, settings, now));
  await f.db.transaction(db => recordDailyFlowSync(db, value, settings, '2026-11-04T08:01:00.000Z',
    { opId: 'advance', now: '2026-11-04T08:01:00.000Z', token: value.session.daily! }));
  const snapshot = await captureFolderSyncSource({ host: f.host, previous: [] });
  cleanups.push(snapshot.dispose);
  const object = snapshot.objects.find(entry => entry.objectType === 'daily_flow')!;
  const decoded = await inspectStagedObject(f.host, snapshot, object);
  expect(decoded.facts).toEqual([]);
  expect(decoded.tableMessages).toEqual(['daily_flow_table_begin', 'daily_flow_table_batch', 'daily_flow_table_end']);
});

it('honors cancellation and releases partially staged source data without changing source facts', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const host = { ...f.host, files: { ...f.host.files, async write(key: string, bytes: Uint8Array) {
    await f.host.files.write(key, bytes);
    if (key.includes('object-0-frame-')) controller.abort(new Error('source_scope_changed'));
  } } };
  await expect(captureFolderSyncSource({ host, previous: [], signal: controller.signal }))
    .rejects.toThrow('source_scope_changed');
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('First article');
  expect(await f.files.list('requests/folder-sync')).toEqual([]);
});

it('lets existing startup request cleanup remove an abandoned folder export without changing source facts', async () => {
  const f = await fixture();
  const snapshot = await captureFolderSyncSource({ host: f.host, previous: [] });
  cleanups.push(snapshot.dispose);
  const frame = snapshot.objects[0]!.frames[0]!;
  expect(await f.files.read(frame.key)).not.toBeNull();
  // The production host removes abandoned request files when configuring a new database generation.
  await f.files.remove('requests');
  expect(await f.files.read(frame.key)).toBeNull();
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('First article');
});

// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { startFramedSyncResourceDemandRequest } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { scanFramedSyncResourceNeeds } from '../../lib/core/sync/framedSyncResourceNeedScan.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

async function currentBodyFixture(text: string, references?: string) {
  const host = textDevice();
  const record = textBranch('version', text);
  if (references !== undefined) record.snapshot.resource_references = references;
  await host.receive([record]);
  return { ...host, record };
}

const receiver = { groupId: 'group', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

it('finds lost files without new database facts and ignores old image registrations and out-of-scope nodes', async () => {
  const bytes = Buffer.from('actual image bytes');
  const key = `${hash(bytes)}.png`;
  const stale = `${'a'.repeat(64)}.png`;
  const reference = `${'b'.repeat(64)}.pdf`;
  const host = await currentBodyFixture(`> [label]: asset://${key}\n> ![label]`, JSON.stringify([
    { storage_key: stale, role: 'image', original_name: 'Old.png' },
    { storage_key: reference, role: 'reference', original_name: 'Reference.pdf' }
  ]));
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-scan-'));
  try {
    const before = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
    await writeFile(path.join(root, key), bytes);
    const checked: string[] = [];
    const input = { db: host.db, receiver, globalIds: [host.record.object_id], createId: randomUUID,
      isPresent: async (storageKey: string) => {
        checked.push(storageKey);
        const file = await readFile(path.join(root, storageKey)).catch(() => null);
        return file !== null && hash(file) === storageKey.slice(0, 64);
      } };
    expect(await scanFramedSyncResourceNeeds({ ...input, globalIds: [] })).toEqual({ scanned: 0, missing: 0, unavailable: 0 });
    expect(checked).toEqual([]);
    expect(await scanFramedSyncResourceNeeds(input)).toEqual({ scanned: 1, missing: 1, unavailable: 0 });
    expect(checked.sort()).toEqual([key, reference].sort());
    await rm(path.join(root, key));
    expect(await scanFramedSyncResourceNeeds(input)).toEqual({ scanned: 1, missing: 2, unavailable: 0 });
    const demands = host.sqlite.prepare('SELECT demand_id, storage_key, state FROM framed_sync_resource_demands ORDER BY storage_key').all();
    expect(demands).toHaveLength(2);
    expect(demands).not.toContainEqual(expect.objectContaining({ storage_key: stale }));
    await scanFramedSyncResourceNeeds(input);
    expect(host.sqlite.prepare('SELECT demand_id, storage_key, state FROM framed_sync_resource_demands ORDER BY storage_key').all()).toEqual(demands);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
    const pending = host.sqlite.prepare('SELECT * FROM framed_sync_resource_demands WHERE storage_key = ?').get(reference) as
      { demand_id: string; global_id: string; version_id: string; body_hash: string };
    await startFramedSyncResourceDemandRequest(host.db, { ...receiver, globalId: pending.global_id,
      versionId: pending.version_id, bodyHash: pending.body_hash, storageKey: reference }, pending.demand_id, new Uint8Array(32).fill(1));
    host.sqlite.prepare('UPDATE nodes SET body_blob_hash = ? WHERE id = ?').run('c'.repeat(64), host.record.object_id);
    expect(await scanFramedSyncResourceNeeds(input)).toEqual({ scanned: 0, missing: 0, unavailable: 1 });
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_resource_demands WHERE state = ?').pluck().get('pending')).toBe(2);
    host.sqlite.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run('2026-10-07T00:00:00Z', host.record.object_id);
    expect(await scanFramedSyncResourceNeeds(input)).toEqual({ scanned: 0, missing: 0, unavailable: 0 });
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_resource_demands WHERE storage_key = ?').pluck().get(key)).toBe('no_longer_required');
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_resource_demands WHERE storage_key = ?').pluck().get(reference)).toBe('pending');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_resource_demands WHERE state = ?').pluck().get('verified_present')).toBe(0);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_temp_master WHERE name LIKE 'markdown_body_%' OR name = 'framed_sync_current_resource_keys'").all()).toEqual([]);
  } finally { host.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('rolls back a node scan after a file check fails and retries without temporary tables or partial demands', async () => {
  const a = `${'a'.repeat(64)}.png`;
  const b = `${'b'.repeat(64)}.png`;
  const host = await currentBodyFixture(`![a](asset://${a})\n![b](asset://${b})`);
  try {
    const input = { db: host.db, receiver, globalIds: [host.record.object_id], createId: randomUUID,
      isPresent: async (key: string) => { if (key === b) throw new Error('file_check_failed'); return false; } };
    await expect(scanFramedSyncResourceNeeds(input)).rejects.toThrow('file_check_failed');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_resource_demands').pluck().get()).toBe(0);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_temp_master WHERE name LIKE 'markdown_body_%' OR name = 'framed_sync_current_resource_keys'").all()).toEqual([]);
    expect(await scanFramedSyncResourceNeeds({ ...input, isPresent: async () => false })).toEqual({ scanned: 1, missing: 2, unavailable: 0 });
  } finally { host.sqlite.close(); }
});

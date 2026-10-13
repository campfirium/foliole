// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { INBOX_NODE_ID } from '../database/specialNodeIds.js';

import { applyFramedFactSources } from './framedSyncFactApply.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';

const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.sqlite.close()));
const resource = `${'a'.repeat(64)}.pdf`;

async function receive(host: ReturnType<typeof textDevice>, records: ReturnType<typeof textBranch>[]) {
  const bodies = new Map<string, Uint8Array>();
  const facts = records.flatMap(record => {
    const projected = projectFramedSyncNodeRecord(record);
    bodies.set(bytesToHex(projected.manifest.blobs[0]!.sha256), projected.bodyBlob);
    return projected.manifest.facts;
  });
  return applyFramedFactSources(host.db, [async function* () { yield* facts; }], {
    requireCompleteVersionGraph: true,
    loadBody: async (_db, blob) => {
      const body = bodies.get(bytesToHex(blob.sha256));
      if (!body) throw new Error('request_sync_body_missing');
      return body;
    }
  });
}

it('applies title, reveal and canonical attachment references without needing a local file', async () => {
  const host = textDevice(); hosts.push(host);
  const record = textBranch('original-version', 'Complete body');
  record.snapshot = { ...record.snapshot, title: 'Imported topic', reveal: 'Answer',
    resource_references: JSON.stringify([{ storage_key: resource, original_name: 'Original.pdf', role: 'reference' }]) };
  await receive(host, [record]);
  const current = await host.current();
  expect(current.snapshot.title).toBe('Imported topic');
  expect(current.snapshot.reveal).toBe('Answer');
  expect(current.body_text).toBe('Complete body');
  expect(JSON.parse(current.snapshot.resource_references!)).toEqual([
    { storage_key: resource, original_name: 'Original.pdf', role: 'reference' }
  ]);
  const before = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  await receive(host, [record]);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
});

it('reconstructs a missing special parent before applying a child and keeps it outside version history', async () => {
  const host = textDevice(); hosts.push(host);
  const record = textBranch('child-version', 'Child body');
  record.snapshot = { ...record.snapshot, parent_id: INBOX_NODE_ID, title: 'Child' };
  await receive(host, [record]);
  expect(host.sqlite.prepare('SELECT id, title FROM nodes ORDER BY id').all()).toEqual([
    { id: INBOX_NODE_ID, title: 'Inbox' }, { id: 'topic', title: 'Child' }
  ]);
  expect(host.sqlite.prepare('SELECT object_id FROM node_sync_versions').all()).toEqual([{ object_id: 'topic' }]);
});

it('rejects a missing original version parent without writing nodes, versions or special roots', async () => {
  const host = textDevice(); hosts.push(host);
  const record = textBranch('child-version', 'Child body');
  record.parent_version_id = 'missing-original'; record.parent_version_ids = ['missing-original'];
  record.snapshot = { ...record.snapshot, parent_id: INBOX_NODE_ID };
  await expect(receive(host, [record])).rejects.toThrow('node_version_missing_parents:missing-original');
  expect(host.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
});

it('rejects a snapshot assigned to a different object before applying any data', async () => {
  const host = textDevice(); hosts.push(host);
  const record = textBranch('version', 'Original body');
  record.snapshot = { ...record.snapshot, id: 'different-object' };
  await expect(receive(host, [record])).rejects.toThrow('node_version_projection_identity_invalid');
  expect(host.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
});

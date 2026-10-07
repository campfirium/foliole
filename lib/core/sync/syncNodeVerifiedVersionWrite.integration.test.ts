// @vitest-environment node
import { expect, it } from 'vitest';

import { referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';

import { stageTextBodyContent } from './bodyContentWrite.js';
import { loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { upsertVerifiedSyncNodeVersion } from './syncNodeVerifiedVersionWrite.js';
import { alternativeForBody } from './topicTextState.js';
import { readBodyText } from './verifiedBody.js';

const timestamp = '2026-10-07T00:00:00.000Z';

it.each(['', '\ufeff"\\\t中文😀\r\n' + 'x'.repeat(3 * 1024 * 1024)])(
  'persists and replays an immutable version using stable body ownership', async (body) => {
    const host = textDevice();
    try {
      await migrateBodyContentStorage(host.db);
      const original = textBranch('version', body, undefined, timestamp);
      const record = await referencedNode(host.db, original);
      expect(await upsertVerifiedSyncNodeVersion(host.db, record)).toBe('created');
      expect(await upsertVerifiedSyncNodeVersion(host.db, record)).toBe('identical');
      const restored = await loadVerifiedSyncNodeVersion(host.db, 'version');
      if (restored?.body.kind !== 'readable') throw new Error('readable_version_required');
      expect(await readBodyText(host.db, restored.body.ref)).toBe(body);
      expect(restored.metadata.content_hash).toBe(original.content_hash);
      expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
      expect(host.sqlite.prepare('SELECT body_text, json_extract(snapshot_json, \'$.content\') AS content FROM node_sync_versions').get())
        .toEqual({ body_text: null, content: null });
      const before = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
      const changed = await stageTextBodyContent(host.db, 'Different body');
      await expect(upsertVerifiedSyncNodeVersion(host.db, { ...record, body: { kind: 'readable', ref: changed } }))
        .rejects.toThrow('sync_pack_node_version_immutable_mismatch');
      await expect(upsertVerifiedSyncNodeVersion(host.db, { ...record, metadata: { ...record.metadata, host_name: 'Other' } }))
        .rejects.toThrow('sync_pack_node_version_immutable_mismatch');
      expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
    } finally { host.sqlite.close(); }
  }
);

it('preserves original parent edges and does not refill a retired ordinary version on replay', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    const base = textBranch('base', 'Base', undefined, timestamp);
    const original = textBranch('version', 'Descendant', base, timestamp);
    const record = await referencedNode(host.db, original);
    await upsertVerifiedSyncNodeVersion(host.db, await referencedNode(host.db, base));
    await upsertVerifiedSyncNodeVersion(host.db, { ...record, body: { kind: 'retired' } });
    expect(await upsertVerifiedSyncNodeVersion(host.db, record)).toBe('identical');
    expect((await loadVerifiedSyncNodeVersion(host.db, 'version'))?.body).toEqual({ kind: 'retired' });
    expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'version', parent_version_id: 'base', ordinal: 0 }]);
    expect((await loadVerifiedSyncNodeVersion(host.db, 'version'))?.metadata.ancestor_version_ids).toEqual(['base']);
  } finally { host.sqlite.close(); }
});

it('rolls back adoption and the version when a retained alternative is unavailable', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    const original = textBranch('version', 'Main', undefined, timestamp);
    original.snapshot.text_alternatives = [alternativeForBody(textBranch('other', 'Missing', undefined, timestamp), timestamp)];
    const record = await referencedNode(host.db, original);
    await expect(upsertVerifiedSyncNodeVersion(host.db, record)).rejects.toThrow('text_alternative_body_unavailable');
    expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blobs').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies WHERE verified = 1').pluck().get()).toBe(1);
    const main = { ...record, metadata: { ...record.metadata, snapshot: { ...record.metadata.snapshot, text_alternatives: [] } } };
    await upsertVerifiedSyncNodeVersion(host.db, main);
    await expect(upsertVerifiedSyncNodeVersion(host.db, record)).rejects.toThrow('text_alternative_body_unavailable');
    expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(1);
  } finally { host.sqlite.close(); }
});

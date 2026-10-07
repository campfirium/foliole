// @vitest-environment node
import { expect, it } from 'vitest';

import { branches, nodeMetadata, observeReads, seededDevice } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';

import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import { loadCurrentVerifiedSyncNode, loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { loadRetainedVerifiedSyncNodeVersions } from './syncNodeVerifiedRetainedVersions.js';
import { readBodyText } from './verifiedBody.js';

it.each(['', '\ufeff---\r\n中文: 😀\r\n---\r\n' + 'x'.repeat(3 * 1024 * 1024)])(
  'loads current and historical identities through header references without body queries', async (body) => {
    const records = branches(body, 'Peer');
    const source = await seededDevice(records.base, records.local, [records.incoming], false);
    try {
      const currentMetadata = nodeMetadata(source.current);
      const historical = (await loadRetainedSyncNodeVersionFact(source.db, 'incoming'))!;
      await migrateBodyContentStorage(source.db);
      const reads = observeReads(source.db);
      const current = await loadCurrentVerifiedSyncNode(reads.port, 'topic');
      const previous = await loadVerifiedSyncNodeVersion(reads.port, 'incoming');
      expect(current?.metadata).toEqual(currentMetadata);
      expect(previous?.metadata).toEqual(nodeMetadata(historical));
      expect(reads.sizes).toEqual([]);
      if (current?.body.kind !== 'readable') throw new Error('readable_current_required');
      expect(await readBodyText(source.db, current.body.ref)).toBe(body);
      expect(current.body.ref.utf16Length).toBe(body.length);
      expect((await loadVerifiedSyncNodeVersion(source.db, 'incoming', false))?.metadata.ancestor_version_ids).toEqual([]);
      expect(await loadVerifiedSyncNodeVersion(source.db, 'absent')).toBeNull();
      expect(await loadCurrentVerifiedSyncNode(source.db, 'absent')).toBeNull();
    } finally { source.sqlite.close(); }
  }
);

it('distinguishes empty, retired and unavailable versions and refuses unreadable current text', async () => {
  const records = branches('', 'Peer');
  const source = await seededDevice(records.base, records.local, [records.incoming], false);
  try {
    for (const [id, hash] of [['retired', null], ['unavailable', 'f'.repeat(64)]] as const) {
      await upsertRemoteVersion(source.db, { ...records.base, version_id: id, parent_version_ids: [],
        parent_version_id: null, ancestor_version_ids: [], body_text: null,
        snapshot: { ...records.base.snapshot, content: null, body_blob_hash: hash } });
    }
    await migrateBodyContentStorage(source.db);
    const empty = await loadCurrentVerifiedSyncNode(source.db, 'topic');
    expect(empty?.body.kind).toBe('readable');
    if (empty?.body.kind !== 'readable') throw new Error('readable_empty_required');
    expect(empty.body.ref.byteLength).toBe(0);
    expect((await loadVerifiedSyncNodeVersion(source.db, 'retired'))?.body).toEqual({ kind: 'retired' });
    expect((await loadVerifiedSyncNodeVersion(source.db, 'unavailable'))?.body)
      .toEqual({ kind: 'unavailable', hash: 'f'.repeat(64) });
    await expect(loadRetainedVerifiedSyncNodeVersions(source.db, ['unavailable']))
      .rejects.toThrow('sync_node_version_body_unavailable:unavailable');
    await source.db.run('DELETE FROM content_bodies WHERE hash = ?', [empty.body.ref.hash]);
    expect((await loadVerifiedSyncNodeVersion(source.db, empty.metadata.version_id!))?.body)
      .toEqual({ kind: 'unavailable', hash: empty.body.ref.hash });
    await expect(loadCurrentVerifiedSyncNode(source.db, 'topic')).rejects.toThrow('sync_node_version_body_unavailable:local');
    expect(source.sqlite.prepare('SELECT count(*) AS count FROM content_blob_data').get()).toEqual({ count: 0 });
  } finally { source.sqlite.close(); }
});

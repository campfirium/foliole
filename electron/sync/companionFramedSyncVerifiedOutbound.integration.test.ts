// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';
import { loadVerifiedBodyRef, readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { inspectCompanionFramedSyncOutbound, prepareCompanionFramedSyncOutbound } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncOutbound.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { facts, payload, source, time } from './companionFramedSyncVerifiedOutbound.testSupport.js';

it('preserves empty and large BOM Unicode NUL canonical facts and publication identity without returning body text', async () => {
  for (const body of ['', '\ufeff中文😀\0' + '中😀'.repeat(500_000)]) {
    const host = await source(body);
    try {
      const original = await prepareCompanionFramedSyncOutbound(host.db, payload);
      await host.migrate();
      const stable = await prepareCompanionFramedSyncOutbound(host.db, payload, 'chunked');
      expect(facts(stable)).toEqual(facts(original));
      expect(stable).toMatchObject({ content_id: original.content_id, transfer_id: original.transfer_id, publication_state: 'identical' });
      expect(stable.blobs).toEqual(original.blobs.map(({ byte_length, required, role, sha256 }) => ({ byte_length, required, role, sha256, body_source: 'verified_chunks' })));
      expect(await prepareCompanionFramedSyncOutbound(host.db, { ...payload, transfer_id: stable.transfer_id }, 'chunked')).toEqual(stable);
      expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
    } finally { host.sqlite.close(); }
  }
});

it.each(['matching', 'standalone', 'mismatch'] as const)('preserves %s tombstone transport and every alternative without rewriting proof content', async (mode) => {
  const host = await source('Earlier');
  try {
    const record = textBranch('deleted', 'Original proof中文', undefined, time);
    record.is_tombstone = true;
    record.snapshot.deleted_at = time;
    const alternative = alternativeForBody(textBranch('other', 'Alternative😀', undefined, time), time);
    record.snapshot.text_alternatives = [alternative];
    await upsertTextBodyBlob(host.db, 'Alternative😀', time, alternative.body_blob_hash);
    record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! });
    if (mode !== 'standalone') await upsertRemoteVersion(host.db, record);
    await applyRemoteNodeTombstone(host.db, record, false);
    if (mode === 'mismatch') host.sqlite.prepare("UPDATE node_sync_versions SET host_name = 'different' WHERE version_id = 'deleted'").run();
    const original = await prepareCompanionFramedSyncOutbound(host.db, payload);
    await host.migrate();
    const tomb = host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
    const stable = await prepareCompanionFramedSyncOutbound(host.db, payload, 'chunked');
    expect(facts(stable)).toEqual(facts(original));
    expect(stable.content_id).toBe(original.content_id);
    const hashes = stable.blobs.map((blob) => blob.sha256);
    expect(hashes).toEqual(original.blobs.map((blob) => blob.sha256));
    expect(hashes).toContain(hashTextBody(mode === 'matching' ? 'Original proof中文' : ''));
    expect(hashes).toContain(alternative.body_blob_hash);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(tomb);
    const owner = host.sqlite.prepare('SELECT inline_body_hash FROM node_sync_tombstones').pluck().get() as string;
    expect(await readBodyText(host.db, (await loadVerifiedBodyRef(host.db, owner))!)).toBe('Original proof中文');
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(alternative.body_blob_hash);
    await expect(prepareCompanionFramedSyncOutbound(host.db, payload, 'chunked')).rejects.toThrow('text_alternative_body_unavailable');
  } finally { host.sqlite.close(); }
});

it('preserves canonical resources and rejects missing or extra file keys before publication', async () => {
  const host = await source('Original');
  try {
    const key = `${'a'.repeat(64)}.png`, references = JSON.stringify([{ storage_key: key, role: 'image', original_name: 'Original.png' }]);
    host.record.snapshot.resource_references = references;
    host.sqlite.prepare('UPDATE node_sync_versions SET snapshot_json = ?').run(JSON.stringify(host.record.snapshot));
    host.sqlite.prepare('UPDATE nodes SET resource_references = ?').run(references);
    const input = { ...payload, resource_files: [{ storage_key: key, byte_length: '17' }] };
    const original = await prepareCompanionFramedSyncOutbound(host.db, input);
    await host.migrate();
    expect(await inspectCompanionFramedSyncOutbound(host.db, payload, 'chunked')).toEqual({ resource_storage_keys: [key] });
    const stable = await prepareCompanionFramedSyncOutbound(host.db, input, 'chunked');
    expect(facts(stable)).toEqual(facts(original));
    expect(stable.blobs.find((blob) => blob.storage_key === key)).toEqual(original.blobs.find((blob) => blob.storage_key === key));
    await expect(prepareCompanionFramedSyncOutbound(host.db, payload, 'chunked')).rejects.toThrow('framed_sync_outbound_resource_unavailable');
    await expect(prepareCompanionFramedSyncOutbound(host.db, { ...input,
      resource_files: [...input.resource_files, { storage_key: `${'b'.repeat(64)}.png`, byte_length: '0' }] }, 'chunked'))
      .rejects.toThrow('framed_sync_outbound_resource_files_mismatch');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(1);
  } finally { host.sqlite.close(); }
});

it('preserves external role5 metadata, original state identity and verified source', async () => {
  const host = await source('Other node');
  try {
    const body = '外部😀\0' + '中'.repeat(1_100_000), hash = hashTextBody(body);
    await upsertTextBodyBlob(host.db, body, time, hash);
    const document = { body_blob_hash: hash, content_hash: hash, document_id: 'document', extension: 'md',
      file_name: 'original.md', folder_id: 'folder', reference_json: null, reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
    await applySyncObjectInTransaction(host.db, { object_type: 'external_document', object_id: 'document', deleted_at: null,
      content_hash: computeSyncContentHash('external_document', document), payload_json: JSON.stringify(document), updated_at: time });
    const input = { ...payload, object_id: 'document', object_type: 'external_document' };
    const original = await prepareCompanionFramedSyncOutbound(host.db, input);
    await host.migrate();
    const stable = await prepareCompanionFramedSyncOutbound(host.db, input, 'chunked');
    expect(facts(stable)).toEqual(facts(original));
    expect(stable.blobs).toEqual(original.blobs.map(({ byte_length, required, role, sha256 }) =>
      ({ byte_length, required, role, sha256, body_source: 'verified_chunks' })));
    for (const blob of stable.blobs) expect(blob).not.toHaveProperty('data_text');
  } finally { host.sqlite.close(); }
});

it('keeps retired ancestry identity-only in parent order and rejects unavailable source bodies', async () => {
  const host = await source('Ancestor');
  try {
    const child = textBranch('child', 'Current', host.record, '2026-10-07T00:00:01.000Z');
    await applyConvergentSyncNodesWithDbPort(host.db, [child]);
    host.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL) WHERE version_id = 'version-1'`);
    const input = { ...payload, include_current_node: false, required_relation_ids: [JSON.stringify(['child', 'version-1', 0])] };
    const original = await prepareCompanionFramedSyncOutbound(host.db, input);
    await host.migrate();
    const stable = await prepareCompanionFramedSyncOutbound(host.db, input, 'chunked');
    expect(facts(stable)).toEqual(facts(original));
    expect(facts(stable).filter((fact) => fact.kind === 2).map((fact) => fact.factId)).toEqual(['version-1', 'child']);
    expect(stable.blobs).toHaveLength(1);
    host.sqlite.exec("UPDATE node_sync_versions SET body_state = 'unavailable' WHERE version_id = 'child'");
    await expect(prepareCompanionFramedSyncOutbound(host.db, input, 'chunked')).rejects.toThrow('sync_node_version_body_unavailable:child');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(1);
  } finally { host.sqlite.close(); }
});

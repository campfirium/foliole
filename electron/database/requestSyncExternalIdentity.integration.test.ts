// @vitest-environment node
import { hexToBytes } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { framedSyncObjectStateFactId } from '../../lib/core/sync/framedSyncObjectStateInventory.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';

import { context, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const at = '2026-04-27T00:03:00.000Z';
const later = '2026-05-01T00:00:00.000Z';
const folder = { id: 'folder-1', attachment_mode: 'document_relative_first_then_fixed_root',
  excluded_dirs_json: '[]', host_name: 'desktop', host_platform: 'darwin', source_ref: 'external:folder-1' };

function fact(objectType: 'external_document' | 'external_folder' | 'import_source', globalId: string,
  payload: Record<string, string | number | boolean | null> | null,
  hash = computeSyncContentHash(objectType, payload ?? buildCanonicalSyncTombstone(globalId)), updatedAt = at): CanonicalFact {
  return { objectType, globalId, factId: framedSyncObjectStateFactId(objectType, hash), kind: 1,
    sharedStateHash: hexToBytes(hash), blobs: [], body: [
      ['content_hash', hash], ['current_version_id', null], ['deleted_at', payload ? null : at],
      ['payload_json', payload ? JSON.stringify(payload) : null], ['updated_at', updatedAt]
    ].map(([name, value]) => ({ name: name!, value: value === null ? { kind: 'null' as const }
      : { kind: 'string' as const, value: value! } })) };
}

function receive(source: RestorePeer, target: RestorePeer, value: CanonicalFact) {
  return applyRequestSyncObject(target.db, {
    context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
      library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: value.objectType, globalId: value.globalId, requestId: new Uint8Array(16),
    facts: async function* () { yield value; }, loadBody: async () => { throw new Error('unexpected_body'); }
  });
}

function rows(peer: RestorePeer) {
  return ['import_sources', 'external_search_folders', 'desktop_sources', 'external_documents', 'sync_object_state',
    'node_version_local_source_revisions', 'node_version_device_revisions']
    .map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

it('preserves all remote import-source fields through request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const remote = { remote_provider: 'readwise', remote_connection_ref: 'readwise-connection',
      remote_document_id: 'reader-document',
      remote_annotations_json: '[{"kind":"highlight","nodeId":"highlight-1","remoteId":"reader-highlight"}]',
      remote_import_state_json: '{"version":1,"bodyState":"materialized"}' };
    const payload = { source_fingerprint: 'source-contract', provider: 'desktop_text_file', source_kind: 'markdown',
      source_name: 'Source.md', source_locator: '/history/Source.md', first_imported_at: at, last_imported_at: at,
      last_content_fingerprint: 'content-contract', latest_node_id: null, source_ref: 'readwise:articles',
      source_location: 'Source.md', ...remote };
    const value = fact('import_source', 'source-contract', payload);
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, value); target.reopen();
      expect(target.sqlite.prepare(`SELECT remote_provider, remote_connection_ref, remote_document_id,
        remote_annotations_json, remote_import_state_json FROM import_sources`).all()).toEqual([remote]);
      expect(target.sqlite.prepare("SELECT content_hash FROM sync_object_state WHERE object_type = 'import_source'")
        .pluck().get()).toBe(computeSyncContentHash('import_source', payload));
    }
  } finally { await fixture.close(); }
});

it.each(['bad-hash', 'source-conflict'] as const)('rejects external folder %s without changing facts or progress', async kind => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await receive(source, target, fact('external_folder', folder.id, folder));
    const before = rows(target);
    const incoming = kind === 'bad-hash' ? fact('external_folder', folder.id, folder, 'a'.repeat(64), later)
      : fact('external_folder', 'folder-2', { ...folder, id: 'folder-2' }, undefined, later);
    await expect(receive(source, target, incoming)).rejects.toThrow(
      kind === 'bad-hash' ? 'sync_content_hash_mismatch:external_folder' : 'source_identity_conflict');
    target.reopen(); expect(rows(target)).toEqual(before);
  } finally { await fixture.close(); }
});

it.each(['live', 'tombstone'] as const)('rejects an external document %s bound to another identity without pollution', async kind => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await receive(source, target, fact('external_folder', folder.id, folder));
    const payload = { document_id: 'document-1', folder_id: folder.id, body_blob_hash: null, content_hash: '',
      extension: '.md', file_name: 'Doc.md', relative_path: 'Doc.md', reference_json: null,
      reference_kind: 'file', title: 'Doc' };
    await receive(source, target, fact('external_document', 'document-1', payload));
    const before = rows(target);
    const incoming = kind === 'live' ? fact('external_document', 'document-2',
      { ...payload, relative_path: 'Different.md' }, undefined, later)
      : fact('external_document', 'document-1', null,
        computeSyncContentHash('external_document', buildCanonicalSyncTombstone('document-2')), later);
    await expect(receive(source, target, incoming)).rejects.toThrow('sync_content_hash_mismatch:external_document');
    target.reopen(); expect(rows(target)).toEqual(before);
  } finally { await fixture.close(); }
});

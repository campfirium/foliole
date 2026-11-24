// @vitest-environment node
import { expect, it } from 'vitest';

import { restoreFixture, type RestorePeer } from '../../../electron/database/requestSyncRestoreRecovery.testSupport.js';
import { createDesktopRequestSyncExchange } from '../../../electron/sync/desktopRequestSyncExchange.js';
import { groupKey, state, syncServer } from '../../../electron/sync/requestSyncDatabaseHttp.testSupport.js';
import { computeSyncContentHash } from '../database/syncState.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { transferRequestSyncBatch } from './requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from './requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';
import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';

function indexDocument(peer: RestorePeer, id: string, content: string, updatedAt = '2026-11-24T10:00:00Z') {
  const bodyHash = hashTextBody(content);
  const payload = { body_blob_hash: bodyHash, content_hash: bodyHash, document_id: id, extension: 'md',
    file_name: `${id}.md`, folder_id: 'folder', reference_json: null, reference_kind: 'local_path',
    relative_path: `${id}.md`, title: id };
  return peer.db.transaction(db => applySyncObjectInTransaction(db, { object_type: 'external_document',
    object_id: id, content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
    payload_json: JSON.stringify({ ...payload, content }), updated_at: updatedAt }));
}

it('pulls and persists other external documents when a body exceeds the sync budget', async () => {
  const fixture = await restoreFixture();
  const phone = await fixture.companionPeer('source');
  const desktop = fixture.peer('target');
  const server = syncServer(phone, desktop);
  const oversized = '中'.repeat(700_000);
  const failures: string[] = [];
  try {
    await indexDocument(desktop, 'a', 'First');
    await indexDocument(desktop, 'b', oversized);
    await indexDocument(desktop, 'c', 'Last');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: phone.id, initiatorLibraryEpoch: phone.epoch,
      responderDeviceId: desktop.id, responderLibraryEpoch: desktop.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const run = () => runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(phone.host, exchange),
      transferObjects: items => transferRequestSyncBatch(phone.host, exchange, items, { peerState: state(desktop.id) }),
      reportObjectError: (item, error, stage) => failures.push(`${item.globalId}:${stage}:${(error as Error).message}`)
    });

    expect(await run()).toMatchObject({ complete: false, pending: 1, transferred: 2, onlyRejectedObjectsPending: true });
    expect(failures).toEqual(['b:prepare:request_sync_body_too_large']);
    phone.reopen();
    const received = () => phone.db.query('SELECT document_id, content FROM external_documents ORDER BY document_id');
    expect(await received()).toEqual([{ document_id: 'a', content: 'First' }, { document_id: 'c', content: 'Last' }]);
    expect(await desktop.db.query("SELECT content = ? AS intact FROM external_documents WHERE document_id = 'b'", [oversized]))
      .toEqual([{ intact: 1 }]);

    await indexDocument(desktop, 'b', 'Now within budget', '2026-11-24T11:00:00Z');
    expect(await run()).toMatchObject({ complete: true, pending: 0, transferred: 1 });
    phone.reopen();
    expect(await received()).toEqual([
      { document_id: 'a', content: 'First' }, { document_id: 'b', content: 'Now within budget' },
      { document_id: 'c', content: 'Last' }
    ]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});

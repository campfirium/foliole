import { stageTextBodyContent, adoptVerifiedBody } from '../../lib/core/sync/bodyContentWrite.js';
import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { applyVerifiedFramedFactUnit } from '../../lib/core/sync/framedSyncVerifiedFactApply.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { verifiedCompanionFixture, type Kind } from './companionFramedSyncVerifiedApply.testSupport.js';

export const adoption = { endpointUrl: 'http://localhost:38641', groupId: 'group-1',
  libraryEpoch: 'receiver-epoch', providerDeviceId: 'sender', providerDeviceName: 'Sender', providerPlatform: 'darwin' };
export const largeBody = '\ufeff---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(600_000);
type Host = Awaited<ReturnType<typeof verifiedCompanionFixture>>;
type Projection = ReturnType<typeof projectFramedSyncNodeRecord>;

function recordFromReady(host: Host, body: string): NativeSyncNodeRecord {
  const row = host.native.prepare(`SELECT authenticated_plaintext FROM ${host.prefix}_frames WHERE frame_type = 3`)
    .get() as { authenticated_plaintext: Uint8Array };
  const fact = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(row.authenticated_plaintext, 3));
  const metadata = restoreFramedSyncNodeMetadata(fact);
  return { ...metadata, body_text: body, snapshot: { ...metadata.snapshot, content: body } };
}

function rename(record: NativeSyncNodeRecord, id: string, body: string, parent: string | null): NativeSyncNodeRecord {
  return { ...record, object_id: id, version_id: `version-${id}`, body_text: body,
    snapshot: { ...record.snapshot, id, content: body, body_blob_hash: null, parent_id: parent } };
}

async function seedLocal(host: Host, record: NativeSyncNodeRecord) {
  const projection = projectFramedSyncNodeRecord(rename(record, 'old-local', 'Original local body', null));
  await host.port().transaction(async (tx) => {
    const ref = await stageTextBodyContent(tx, 'Original local body');
    await adoptVerifiedBody(tx, ref, record.updated_at);
    await applyVerifiedFramedFactUnit(tx, projection.manifest.facts, { enqueueSearchInvalidations: false });
  });
}

async function appendParent(host: Host, projection: Projection) {
  const transferId = new Uint8Array(32).fill(2), attemptId = new Uint8Array(16).fill(2);
  const input = { ...host.input, transferId };
  const descriptor = projection.manifest.blobs[0]!;
  host.native.prepare(`INSERT INTO ${host.prefix}_transfers VALUES (?, ?, 1, 1, 0, ?, ?, ?, ?, ?, 'ready_to_apply')`)
    .run(transferId, await canonicalContentId(projection.manifest), input.senderDeviceId, input.senderLibraryEpoch,
      input.receiverDeviceId, input.receiverLibraryEpoch, attemptId);
  if (input.stagingKind === 'android') host.native.prepare(`INSERT INTO ${host.prefix}_attempts VALUES (?, ?, 'promoted')`)
    .run(transferId, attemptId);
  host.native.prepare(`INSERT INTO ${host.prefix}_frames VALUES (?, ?, '0', 3, ?, ?, ?, ?)`)
    .run(transferId, attemptId, new Uint8Array(96), new Uint8Array(16), Uint8Array.of(1),
      encodeValidatedProtocolMessage('fact', factToWire(projection.manifest.facts[0]!)));
  host.native.prepare(`INSERT INTO ${host.prefix}_available_blobs VALUES (?, 0)`).run(descriptor.sha256);
  host.native.prepare(`INSERT INTO ${host.prefix}_blob_pins VALUES (?, ?, 0, 1, 1)`).run(transferId, descriptor.sha256);
  return input;
}

export async function verifiedAdoptionFixture(kind: Kind) {
  const host = await verifiedCompanionFixture(kind, largeBody);
  try {
    const record = recordFromReady(host, largeBody);
    await seedLocal(host, record);
    const child = projectFramedSyncNodeRecord(rename(record, 'child', largeBody, 'parent'));
    const parent = projectFramedSyncNodeRecord(rename(record, 'parent', '', null));
    host.native.prepare(`UPDATE ${host.prefix}_frames SET authenticated_plaintext = ? WHERE transfer_id = ?`)
      .run(encodeValidatedProtocolMessage('fact', factToWire(child.manifest.facts[0]!)), host.input.transferId);
    host.native.prepare(`UPDATE ${host.prefix}_transfers SET content_id = ? WHERE transfer_id = ?`)
      .run(await canonicalContentId(child.manifest), host.input.transferId);
    const parentInput = await appendParent(host, parent);
    await beginSyncGroupLocalAdoption(host.port(), adoption);
    return { host, inputs: [host.input, parentInput], child, parent };
  } catch (error) { host.close(); throw error; }
}

const businessTables = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
  'content_bodies', 'content_body_chunks', 'content_blobs', 'framed_sync_receipts', 'sync_group_metadata',
  'node_version_local_proof_state', 'node_version_local_source_revisions', 'framed_sync_inventory',
  'framed_sync_version_summary', 'sync_state_sequence'];

export function businessState(host: Host) {
  return Object.fromEntries(businessTables.map((table) =>
    [table, host.main.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

export function nativeState(host: Host) {
  return Object.fromEntries(['transfers', 'frames', 'blob_pins', 'available_blobs', 'available_blob_chunks']
    .map((suffix) => [suffix, host.native.prepare(`SELECT * FROM ${host.prefix}_${suffix} ORDER BY rowid`).all()]));
}

/** Release acknowledged fixture ownership; this fixture does not exercise the native bridge acknowledgement. */
export function releaseAcknowledgedCopies(host: Host) {
  host.native.transaction(() => {
    host.native.exec(`DELETE FROM ${host.prefix}_blob_pins; DELETE FROM ${host.prefix}_available_blobs`);
  })();
}

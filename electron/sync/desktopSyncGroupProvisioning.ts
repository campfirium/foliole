import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import type { CompanionWorkspacePairPayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupLibraryFacts } from '../../lib/platform/syncGroupContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { recoverInterruptedDesktopSyncGroupProvisioning } from '../database/syncGroupProvisioningRecovery.js';
import {
  activateDesktopSyncGroupProvisioning,
  beginDesktopSyncGroupProvisioning
} from '../database/syncGroupStore.js';

import { resolveDesktopDeviceName } from './companionLanPayloads.js';
import { savePairedSyncGroupPeer } from './companionPairingStore.js';
import { registerPairedCompanionDeviceWithSecret } from './companionPairingStore.js';
import { createDesktopSyncGroupSignedHeaders, requestJson } from './desktopSyncGroupHttp.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupPendingJoin } from './desktopSyncGroupJoinState.js';
import { createDesktopSyncGroupPairingKey, decryptDesktopSyncGroupPairingSecret } from './desktopSyncGroupPairingCrypto.js';
import { extractSyncPackDatabase } from './syncPackContainerReader.js';

export async function requestDesktopSyncGroupJoin(endpointUrl: string) {
  const state = loadDesktopSyncGroupJoinState();
  const candidate = state.candidates.find((item) => item.endpoint_url === endpointUrl);
  if (!candidate) throw new Error('sync_group_candidate_not_found');
  const facts = loadDesktopLibraryFacts();
  if (!isEmpty(facts)) throw new Error('sync_group_requires_empty_library');
  const key = await createDesktopSyncGroupPairingKey();
  const deviceId = loadOrCreateDesktopDeviceId();
  const payload = await requestJson(`${endpointUrl}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: deviceId, device_kind: process.platform, device_name: resolveDesktopDeviceName(),
      group_id: candidate.group_id, library_facts: facts, pairing_public_key: key.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: candidate.timeline_id
    }), headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  saveDesktopSyncGroupPendingJoin({
    candidate, key,
    request: {
      endpoint_url: endpointUrl, expires_at: String(payload.expires_at), group_id: candidate.group_id,
      pair_request_id: String(payload.pair_request_id), status: 'pending', timeline_id: candidate.timeline_id
    }
  });
}

export async function completeDesktopSyncGroupJoin() {
  const pending = loadDesktopSyncGroupJoinState().pending;
  if (!pending) throw new Error('sync_group_join_not_pending');
  const payload = await requestJson(`${pending.candidate.endpoint_url}/companion/pair`, {
    body: JSON.stringify({ pair_request_id: pending.request.pair_request_id }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  }) as unknown as CompanionWorkspacePairPayload;
  if (!payload.sync_group || !payload.member_authorization_id || !Number.isSafeInteger(payload.provisioning_cursor)) {
    throw new Error('sync_group_provisioning_invalid');
  }
  const secret = await decryptDesktopSyncGroupPairingSecret(pending.key.privateKey, payload.encrypted_device_secret);
  if (!payload.provider_encrypted_device_secret || !payload.provider_device_id ||
      !payload.provider_device_kind || !payload.provider_device_name) {
    throw new Error('sync_group_provider_pairing_invalid');
  }
  const providerSecret = await decryptDesktopSyncGroupPairingSecret(
    pending.key.privateKey, payload.provider_encrypted_device_secret
  );
  const localDeviceId = loadOrCreateDesktopDeviceId();
  const peer = savePairedSyncGroupPeer({
    endpoint_url: pending.candidate.endpoint_url, group_id: pending.candidate.group_id,
    local_device_id: localDeviceId, peer_device_id: pending.candidate.provider_device_id,
    peer_device_kind: pending.candidate.provider_device_kind, peer_device_name: pending.candidate.provider_device_name,
    secret, timeline_id: pending.candidate.timeline_id
  });
  registerPairedCompanionDeviceWithSecret({
    deviceId: payload.provider_device_id, deviceKind: payload.provider_device_kind,
    deviceName: payload.provider_device_name, deviceSecret: providerSecret,
    negotiatedProtocolVersion: 1, pairedAt: payload.paired_at,
    remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
  beginDesktopSyncGroupProvisioning({
    deviceId: localDeviceId, emptyProof: loadDesktopLibraryFacts(), group: payload.sync_group,
    provisioningCursor: Number(payload.provisioning_cursor)
  });
  try {
    const cursor = await downloadAndApply(peer, 0);
    if (cursor < Number(payload.provisioning_cursor)) throw new Error('sync_group_provisioning_incomplete');
    await downloadProvisioningResources(peer);
    assertProvisioningResourcesComplete();
    await activateRemote(peer, payload.member_authorization_id, cursor);
    activateDesktopSyncGroupProvisioning(cursor);
    saveDesktopSyncGroupPendingJoin(null);
  } catch (error) {
    recoverInterruptedDesktopSyncGroupProvisioning(openDatabaseConnection());
    throw error;
  }
}

function assertProvisioningResourcesComplete() {
  const driver = openDatabaseConnection().driver;
  const missingBlobs = driver.queryOne<{ value: number }>(
    `SELECT COUNT(*) AS value FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`
  )?.value ?? 0;
  const missingAttachments = driver.queryOne<{ value: number }>(
    "SELECT COUNT(*) AS value FROM attachment_blobs WHERE availability != 'cached'"
  )?.value ?? 0;
  if (missingBlobs || missingAttachments) throw new Error('sync_group_provisioning_resources_incomplete');
}

async function downloadProvisioningResources(peer: ReturnType<typeof savePairedSyncGroupPeer>) {
  const driver = openDatabaseConnection().driver;
  const blobs = driver.queryAll<{ hash: string; stored_sha256: string; stored_size_bytes: number }>(
    `SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash
     WHERE cbd.hash IS NULL ORDER BY cb.hash`
  );
  for (const blob of blobs) {
    const body = await downloadResource(peer, `/companion/content-blob?hash=${encodeURIComponent(blob.hash)}`);
    if (body.length !== blob.stored_size_bytes || createHash('sha256').update(body).digest('hex') !== blob.stored_sha256) {
      throw new Error('content_blob_checksum_mismatch');
    }
    driver.execute('INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [blob.hash, body]);
    driver.execute("UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
      [new Date().toISOString(), new Date().toISOString(), blob.hash]);
  }
  const attachments = driver.queryAll<{ attachment_id: string; content_hash: string; storage_key: string | null }>(
    `SELECT attachment_id, content_hash, storage_key FROM attachment_blobs
     WHERE content_hash IS NOT NULL ORDER BY attachment_id`
  );
  for (const attachment of attachments) {
    const query = new URLSearchParams({ attachment_id: attachment.attachment_id, content_hash: attachment.content_hash });
    const body = await downloadResource(peer, `/companion/attachment-resource?${query.toString()}`);
    if (createHash('sha256').update(body).digest('hex') !== attachment.content_hash) throw new Error('attachment_checksum_mismatch');
    const filePath = resolveAttachmentStoragePath(attachment.attachment_id, undefined, null);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(`${filePath}.partial`, body);
    await fs.rename(`${filePath}.partial`, filePath);
    driver.execute("UPDATE attachment_blobs SET availability = 'cached', storage_key = ?, cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
      [path.basename(filePath), new Date().toISOString(), new Date().toISOString(), attachment.attachment_id]);
  }
}

async function downloadResource(peer: ReturnType<typeof savePairedSyncGroupPeer>, pathWithQuery: string) {
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, { headers: createDesktopSyncGroupSignedHeaders({
    groupId: peer.group_id, localDeviceId: peer.local_device_id, method: 'GET', pathWithQuery, secret: peer.secret
  }) });
  if (!response.ok) throw new Error(`sync_resource_http_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadAndApply(peer: ReturnType<typeof savePairedSyncGroupPeer>, after: number) {
  const pathWithQuery = `/companion/sync-pack?after_state_seq=${after}`;
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({ groupId: peer.group_id, localDeviceId: peer.local_device_id,
      method: 'GET', pathWithQuery, secret: peer.secret })
  });
  if (!response.ok) throw new Error(`sync_pack_http_${response.status}`);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-provisioning-'));
  const incomingPath = path.join(tempRoot, 'incoming.db');
  try {
    const manifest = await extractSyncPackDatabase({ body: Buffer.from(await response.arrayBuffer()), expectedPeerId: peer.local_device_id, outputPath: incomingPath });
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-provisioning' });
    await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
    try {
      await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: after, deviceId: peer.local_device_id, incomingAlias: 'inc' });
    } finally { await port.run('DETACH DATABASE inc'); }
    return manifest.toStateSeq;
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}

async function activateRemote(peer: ReturnType<typeof savePairedSyncGroupPeer>, authorizationId: string, cursor: number) {
  const pathWithQuery = '/companion/sync-group/activate';
  const body = JSON.stringify({ completed_cursor: cursor, completeness: {
    failed_attachment_resource_count: 0, failed_content_blob_count: 0,
    remaining_attachment_resource_count: 0, remaining_content_blob_count: 0, remaining_structure_change_count: 0
  }, group_id: peer.group_id, member_authorization_id: authorizationId, timeline_id: peer.timeline_id });
  await requestJson(`${peer.endpoint_url}${pathWithQuery}`, { body, headers: {
    ...createDesktopSyncGroupSignedHeaders({ body, groupId: peer.group_id, localDeviceId: peer.local_device_id,
      method: 'POST', pathWithQuery, secret: peer.secret }), 'Content-Type': 'application/json'
  }, method: 'POST' });
}

function loadDesktopLibraryFacts(): SyncGroupLibraryFacts {
  const driver = openDatabaseConnection().driver;
  const count = (table: string) => Number(driver.queryOne<{ value: number }>(`SELECT COUNT(*) AS value FROM ${table}`)?.value ?? 0);
  const nodeCount = Number(driver.queryOne<{ value: number }>(
    "SELECT COUNT(*) AS value FROM nodes WHERE id NOT IN ('special-inbox', 'special-virtual-root')"
  )?.value ?? 0);
  return { attachment_count: count('attachments'), content_blob_count: count('content_blobs'), node_count: nodeCount,
    review_log_count: count('review_log'), timeline_id: null };
}

function isEmpty(facts: SyncGroupLibraryFacts) {
  return facts.attachment_count === 0 && facts.content_blob_count === 0 && facts.node_count === 0 && facts.review_log_count === 0 && facts.timeline_id === null;
}

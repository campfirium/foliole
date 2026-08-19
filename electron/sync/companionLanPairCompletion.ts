import type http from 'node:http';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';
import {
  loadDesktopSyncGroup,
  registerSyncGroupMember
} from '../database/syncGroupStore.js';

import { resolveDesktopDeviceName, resolveDesktopHostName } from './companionLanPayloads.js';
import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { encryptCompanionPairingSecret } from './companionPairingEncryption.js';
import {
  completeCompanionPairRequest,
  countPendingCompanionPairRequests,
  loadCompanionPairRequestForCompletion,
  type PendingCompanionPairRequest,
  reservePairCompletionSlot
} from './companionPairingRequests.js';
import {
  countPairedCompanionDevices,
  registerPairedCompanionDevice,
  savePairedSyncGroupPeer
} from './companionPairingStore.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

type StatusUpdater = (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void;
type JsonResponder = (request: http.IncomingMessage, response: http.ServerResponse, statusCode: number, payload: unknown) => void;

export async function handlePairRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  appVersion: string,
  peerId: string,
  updatePairingStatus: StatusUpdater,
  writeJson: JsonResponder
) {
  const payload = await readPayload(request, response, writeJson);
  if (!payload) return;
  const pairRequestId = typeof payload.pair_request_id === 'string' ? payload.pair_request_id.trim() : '';
  if (!pairRequestId) return writeJson(request, response, 400, { error: 'invalid_pair_request' });
  const completion = loadApproved(pairRequestId, request, response, writeJson);
  if (!completion || writeRateLimit(request, response, writeJson)) return;
  const approved = completion.request;
  const compatibility = evaluateSyncProtocolCompatibility(approved.protocol);
  if (compatibility.status === 'incompatible') {
    return writeJson(request, response, 409, {
      compatibility, desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, error: 'protocol_incompatible'
    });
  }
  const { assignedMember, syncGroup } = resolveApprovedSyncGroup(
    approved, completion, pairRequestId
  );
  const workgroupKey = syncGroup ? loadDesktopWorkgroupKey(syncGroup.group_id) : null;
  if (syncGroup && !workgroupKey) throw new Error('sync_group_workgroup_key_missing');
  const pairedArgs = {
    clientAddress: approved.client_address, deviceId: approved.device_id,
    deviceKind: approved.device_kind, deviceName: assignedMember?.host_name ?? approved.host_name,
    negotiatedProtocolVersion: compatibility.negotiated_version ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remoteProtocol: approved.protocol
  };
  const paired = completion.completion ?? (workgroupKey
    ? { device_id: pairedArgs.deviceId, device_secret: workgroupKey.group_key,
      paired_at: new Date().toISOString() }
    : registerPairedCompanionDevice(pairedArgs));
  if (!completion.completion) completeCompanionPairRequest(pairRequestId, paired);
  const providerSecret = workgroupKey && assignedMember
    ? saveProviderRoute(approved, assignedMember, peerId, workgroupKey.group_key) : null;
  const { encryptedSecret, providerEncryptedSecret } = await encryptApprovedSecrets(
    approved, paired.device_secret, providerSecret
  );
  updateStatus(updatePairingStatus);
  writeJson(request, response, 200, {
    app_version: appVersion, compatibility, desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    device_id: paired.device_id, encrypted_device_secret: encryptedSecret,
    host_name: assignedMember?.host_name ?? approved.host_name,
    host_platform: assignedMember?.host_platform ?? approved.host_platform,
    paired_at: paired.paired_at, peer_id: peerId,
    ...(syncGroup ? {
      provider_device_id: peerId,
      provider_device_kind: process.platform,
      provider_device_name: resolveDesktopDeviceName(),
      provider_host_name: resolveDesktopHostName(),
      provider_host_platform: process.platform,
      provider_encrypted_device_secret: providerEncryptedSecret,
      sync_group: syncGroup
    } : {})
  });
}

function resolveApprovedSyncGroup(
  approved: PendingCompanionPairRequest,
  completion: NonNullable<ReturnType<typeof loadCompanionPairRequestForCompletion>>,
  pairRequestId: string
) {
  const current = approved.group_id && approved.timeline_id ? loadDesktopSyncGroup() : null;
  const authorizationId = approved.member_authorization_id ?? pairRequestId;
  const syncGroup = current && !completion.completion ? registerSyncGroupMember({
    approvedByHostName: current.local_host_name,
    authorizationId,
    hostName: approved.host_name,
    hostPlatform: approved.host_platform
  }) : current;
  const assignedMember = syncGroup?.members.find((member) => member.authorization_id === authorizationId)
    ?? syncGroup?.members.find((member) => member.host_name === approved.host_name);
  if (syncGroup && !assignedMember) throw new Error('sync_group_member_not_authorized');
  return { assignedMember, syncGroup };
}

async function encryptApprovedSecrets(
  approved: PendingCompanionPairRequest,
  deviceSecret: string,
  providerSecret: string | null
) {
  const encryptedSecret = await encryptCompanionPairingSecret({
    clientPublicKey: approved.pairing_public_key, deviceSecret
  });
  const providerEncryptedSecret = providerSecret ? await encryptCompanionPairingSecret({
    clientPublicKey: approved.pairing_public_key, deviceSecret: providerSecret
  }) : null;
  return { encryptedSecret, providerEncryptedSecret };
}

function updateStatus(updatePairingStatus: StatusUpdater) {
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
}

function saveProviderRoute(
  approved: PendingCompanionPairRequest,
  assigned: { host_name: string; host_platform: string },
  peerId: string,
  groupKey: string
) {
  if (!approved.group_id || !approved.timeline_id || !approved.client_address) {
    throw new Error('sync_group_provider_pairing_invalid');
  }
  savePairedSyncGroupPeer({
    endpoint_url: `http://${approved.client_address}:38641`,
    group_id: approved.group_id,
    local_device_id: peerId,
    local_host_name: resolveDesktopHostName(),
    peer_device_id: approved.device_id,
    peer_device_kind: approved.device_kind,
    peer_device_name: assigned.host_name,
    peer_host_name: assigned.host_name,
    peer_host_platform: assigned.host_platform,
    timeline_id: approved.timeline_id
  });
  return groupKey;
}

function loadApproved(pairRequestId: string, request: http.IncomingMessage, response: http.ServerResponse, writeJson: JsonResponder) {
  const completion = loadCompanionPairRequestForCompletion(pairRequestId);
  if (!completion) writeJson(request, response, 404, { error: 'pair_request_not_found' });
  else if (completion.request.status === 'pending') writeJson(request, response, 409, { error: 'pair_request_pending' });
  else if (completion.request.status === 'rejected') writeJson(request, response, 403, { error: 'pair_request_rejected' });
  else return completion;
  return null;
}

function writeRateLimit(request: http.IncomingMessage, response: http.ServerResponse, writeJson: JsonResponder) {
  const address = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? null;
  const rate = reservePairCompletionSlot({ clientAddress: address });
  if (rate.allowed) return false;
  writeJson(request, response, 429, { error: 'pair_completion_rate_limited', retry_after_ms: rate.retry_after_ms });
  return true;
}

async function readPayload(request: http.IncomingMessage, response: http.ServerResponse, writeJson: JsonResponder) {
  try {
    return JSON.parse(await readCompanionRequestBody(request)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return null;
  }
}

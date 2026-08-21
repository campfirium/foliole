import type http from 'node:http';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';
import {
  loadDesktopSyncGroup,
  registerSyncGroupMember
} from '../database/syncGroupStore.js';

import { resolveDesktopHostName } from './companionLanPayloads.js';
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
  countPairedCompanionAuthorizations,
  registerPairedCompanionAuthorization,
  savePairedSyncGroupPeer
} from './companionPairingStore.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

type StatusUpdater = (pairing: { paired_authorization_count: number; pending_pair_request_count: number }) => void;
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
  if (rejectIncompatiblePairing(compatibility, request, response, writeJson)) return;
  const { assignedMember, syncGroup } = resolveApprovedSyncGroup(
    approved, completion, pairRequestId
  );
  const workgroupKey = syncGroup ? loadDesktopWorkgroupKey(syncGroup.group_id) : null;
  if (syncGroup && !workgroupKey) throw new Error('sync_group_workgroup_key_missing');
  const pairedArgs = {
    authorizationId: assignedMember?.authorization_id ?? pairRequestId,
    clientAddress: approved.client_address,
    hostName: assignedMember?.host_name ?? approved.host_name, hostPlatform: approved.host_platform,
    negotiatedProtocolVersion: compatibility.negotiated_version ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remoteProtocol: approved.protocol
  };
  const paired = completion.completion ?? (workgroupKey
    ? { authorization_id: pairedArgs.authorizationId,
      host_name: pairedArgs.hostName, credential_secret: workgroupKey.group_key,
      paired_at: new Date().toISOString() }
    : registerPairedCompanionAuthorization(pairedArgs));
  if (!completion.completion) completeCompanionPairRequest(pairRequestId, paired);
  const providerSecret = workgroupKey && assignedMember
    ? saveProviderRoute(approved, assignedMember, peerId, workgroupKey.group_key) : null;
  const { encryptedSecret, providerEncryptedSecret } = await encryptApprovedSecrets(
    approved, paired.credential_secret, providerSecret
  );
  updateStatus(updatePairingStatus);
  writeJson(request, response, 200, createPairCompletionPayload({
    app_version: appVersion, compatibility, desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    authorization_id: paired.authorization_id,
    encrypted_credential_secret: encryptedSecret, host_name: paired.host_name,
    host_platform: assignedMember?.host_platform ?? approved.host_platform,
    paired_at: paired.paired_at, peer_id: peerId,
    ...(syncGroup ? {
      provider_host_name: resolveDesktopHostName(),
      provider_host_platform: process.platform,
      provider_encrypted_credential_secret: providerEncryptedSecret,
      sync_group: syncGroup
    } : {})
  }));
}

function rejectIncompatiblePairing(
  compatibility: ReturnType<typeof evaluateSyncProtocolCompatibility>,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
) {
  if (compatibility.status !== 'incompatible') return false;
  writeJson(request, response, 409, {
    compatibility, desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, error: 'protocol_incompatible'
  });
  return true;
}

function createPairCompletionPayload(payload: Record<string, unknown> & {
  sync_group?: { local_host_name: string; members: Array<{ authorization_id: string; host_name: string }> }
}) {
  const syncGroup = payload.sync_group;
  if (!syncGroup) return payload;
  const providerAuthorizationId = syncGroup.members.find(
    (member) => member.host_name === syncGroup.local_host_name
  )?.authorization_id;
  return {
    ...payload,
    peer_id: providerAuthorizationId,
    provider_authorization_id: providerAuthorizationId
  };
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
  credentialSecret: string,
  providerSecret: string | null
) {
  const encryptedSecret = await encryptCompanionPairingSecret({
    clientPublicKey: approved.pairing_public_key, credentialSecret
  });
  const providerEncryptedSecret = providerSecret ? await encryptCompanionPairingSecret({
    clientPublicKey: approved.pairing_public_key, credentialSecret: providerSecret
  }) : null;
  return { encryptedSecret, providerEncryptedSecret };
}

function updateStatus(updatePairingStatus: StatusUpdater) {
  updatePairingStatus({
    paired_authorization_count: countPairedCompanionAuthorizations(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
}

function saveProviderRoute(
  approved: PendingCompanionPairRequest,
  assigned: { authorization_id: string; host_name: string; host_platform: string },
  peerId: string,
  groupKey: string
) {
  if (!approved.group_id || !approved.timeline_id || !approved.client_address) {
    throw new Error('sync_group_provider_pairing_invalid');
  }
  const group = loadDesktopSyncGroup();
  const local = group?.members.find((member) => member.host_name === group.local_host_name);
  if (!local) throw new Error('sync_group_local_authorization_missing');
  savePairedSyncGroupPeer({
    endpoint_url: `http://${approved.client_address}:38641`,
    group_id: approved.group_id,
    local_authorization_id: local.authorization_id,
    local_host_name: resolveDesktopHostName(),
    peer_authorization_id: assigned.authorization_id,
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

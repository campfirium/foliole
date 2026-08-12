import type http from 'node:http';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolDescriptor
} from '../../lib/platform/syncProtocolContract.js';
import { isActiveSyncGroupMember, loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { isSupportedPairingPublicKey } from './companionPairingEncryption.js';
import {
  countPendingCompanionPairRequests,
  createCompanionPairRequest,
} from './companionPairingRequests.js';
import { countPairedCompanionDevices } from './companionPairingStore.js';
import { isEligibleSyncGroupJoin, parseSyncGroupLibraryFacts } from './companionSyncGroupPairRequest.js';

export { handlePairRequest } from './companionLanPairCompletion.js';

type PairingStatusUpdater = (pairing: {
  paired_device_count: number;
  pending_pair_request_count: number;
}) => void;

type JsonResponder = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown
) => void;

function writePairingStatus(updatePairingStatus: PairingStatusUpdater) {
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
}

async function readJsonPayload(request: http.IncomingMessage) {
  return JSON.parse(await readCompanionRequestBody(request)) as Record<string, unknown>;
}

function normalizeClientAddress(address: string | undefined) {
  if (!address) {
    return null;
  }
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

function resolveSyncGroupJoin(payload: Record<string, unknown>, deviceId: string) {
  const requestedGroupId = typeof payload.group_id === 'string' ? payload.group_id.trim() : '';
  const requestedTimelineId = typeof payload.timeline_id === 'string' ? payload.timeline_id.trim() : '';
  const libraryFacts = parseSyncGroupLibraryFacts(payload.library_facts);
  const requestsGroupJoin = Boolean(requestedGroupId || requestedTimelineId || payload.library_facts !== undefined);
  if (!requestsGroupJoin) return { error: null, syncGroup: null };
  const syncGroup = loadDesktopSyncGroup();
  if (!syncGroup) return { error: 'sync_group_identity_mismatch', syncGroup: null };
  const eligible = isEligibleSyncGroupJoin({
    groupId: syncGroup.group_id,
    isExistingActiveMember: libraryFacts?.timeline_id === syncGroup.timeline_id
      && isActiveSyncGroupMember(syncGroup.group_id, deviceId),
    libraryFacts,
    requestedGroupId,
    requestedTimelineId,
    timelineId: syncGroup.timeline_id
  });
  return { error: eligible ? null : 'sync_group_requires_empty_library', syncGroup };
}

function writePairRequestResult(args: {
  compatibility: ReturnType<typeof evaluateSyncProtocolCompatibility>;
  created: ReturnType<typeof createCompanionPairRequest>;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  writeJson: JsonResponder;
}) {
  if (args.created.rate_limited) {
    args.writeJson(args.request, args.response, 429, {
      error: 'pair_request_rate_limited',
      retry_after_ms: args.created.retry_after_ms
    });
    return false;
  }
  args.writeJson(args.request, args.response, args.created.created ? 202 : 409, {
    compatibility: args.compatibility,
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    expires_at: args.created.request.expires_at,
    pair_request_id: args.created.request.pair_request_id,
    status: 'pending'
  });
  return true;
}

export async function handlePairRequestCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  updatePairingStatus: PairingStatusUpdater,
  onPairRequestCreated: (() => void) | null,
  writeJson: JsonResponder
) {
  let payload: Record<string, unknown>;
  try {
    payload = await readJsonPayload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return;
  }
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : '';
  const deviceKind = typeof payload.device_kind === 'string' ? payload.device_kind.trim() : '';
  const deviceName = typeof payload.device_name === 'string' ? payload.device_name.trim() : '';
  const pairingPublicKey = typeof payload.pairing_public_key === 'string' ? payload.pairing_public_key.trim() : '';
  const protocol = parseSyncProtocolDescriptor(payload.protocol);
  if (!deviceId || !deviceKind || !deviceName || !isSupportedPairingPublicKey(pairingPublicKey)) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const groupJoin = resolveSyncGroupJoin(payload, deviceId);
  if (groupJoin.error) {
    writeJson(request, response, 409, { error: groupJoin.error });
    return;
  }
  const compatibility = evaluateSyncProtocolCompatibility(payload.protocol);
  if (!protocol || compatibility.status === 'incompatible') {
    writeJson(request, response, 409, {
      compatibility,
      desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      error: 'protocol_incompatible'
    });
    return;
  }
  const created = createCompanionPairRequest({
    clientAddress: normalizeClientAddress(request.socket.remoteAddress),
    compatibility,
    deviceId,
    deviceKind,
    deviceName,
    pairingPublicKey,
    protocol,
    ...(groupJoin.syncGroup
      ? { groupId: groupJoin.syncGroup.group_id, timelineId: groupJoin.syncGroup.timeline_id }
      : {})
  });
  const accepted = writePairRequestResult({ compatibility, created, request, response, writeJson });
  if (!accepted) return;
  writePairingStatus(updatePairingStatus);
  onPairRequestCreated?.();
}

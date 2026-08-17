import { openDatabaseConnection } from '../database/connection.js';
import { acknowledgeWatchedFolderDesktopDeliveries } from '../import/watchedFolderClaimDelivery.js';

import type { PairedSyncGroupPeer } from './companionPairingStore.js';
import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const SYNC_PACK_ACK_PATH = '/companion/sync-pack/ack';

export function acknowledgeDesktopSyncPack(bodyText: string, authenticatedPeerId: string) {
  const appliedStateSeq = parseAppliedStateSeq(bodyText);
  const confirmedClaimCount = acknowledgeWatchedFolderDesktopDeliveries(
    openDatabaseConnection().driver,
    authenticatedPeerId,
    appliedStateSeq
  );
  return {
    applied_state_seq: appliedStateSeq,
    confirmed_claim_count: confirmedClaimCount,
    status: 'ok'
  } as const;
}

export async function postDesktopSyncPackAck(args: {
  appliedStateSeq: number;
  peer: PairedSyncGroupPeer;
}) {
  const key = loadDesktopWorkgroupKey(args.peer.group_id);
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const body = JSON.stringify({ applied_state_seq: args.appliedStateSeq });
  const response = await postDesktopWorkgroupJson({
    body,
    endpointUrl: args.peer.endpoint_url,
    groupId: args.peer.group_id,
    localDeviceId: args.peer.local_device_id,
    pathWithQuery: SYNC_PACK_ACK_PATH,
    secret: key.group_key
  });
  if (response.status !== 'ok' || response.applied_state_seq !== args.appliedStateSeq) {
    throw new Error('sync_pack_ack_invalid');
  }
  return response;
}

function parseAppliedStateSeq(bodyText: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error('sync_pack_ack_payload_invalid');
  }
  const value = parsed && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>).applied_state_seq
    : null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('sync_pack_ack_payload_invalid');
  }
  return value as number;
}

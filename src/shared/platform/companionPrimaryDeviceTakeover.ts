import type {
  NativePrimaryDeviceTakeoverPayload,
  NativePrimaryDeviceTakeoverResponse
} from '../../../lib/platform/nativeCompanionSyncContract';

import { runSyncConvergenceCheck } from './companion/sync/diagnostics/companionSyncConvergence';
import { postDesktopJson } from './companionDesktopSyncHttp';
import {
  saveLocalPrimaryDeviceId
} from './companionPrimaryDeviceIdentity';
import { loadCompanionPairingState } from './companionWorkspacePairing';

const PRIMARY_DEVICE_TAKEOVER_PATH = '/companion/primary-device/takeover';

function requireNumber(value: number | null | undefined, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} is required before primary device takeover.`);
  }
  return value;
}

function buildTakeoverPayload(
  candidateDeviceId: string,
  result: Awaited<ReturnType<typeof runSyncConvergenceCheck>>
): NativePrimaryDeviceTakeoverPayload {
  if (result.report.status !== 'converged') {
    throw new Error('This device must sync to the latest desktop state before becoming primary.');
  }
  const android = result.diagnostics.android;
  const desktop = result.diagnostics.desktop;
  if (!android || !desktop) {
    throw new Error('Both Android and desktop diagnostics are required before primary device takeover.');
  }
  return {
    android_pack_cursor: requireNumber(android.sync_state.pack_cursor, 'android_pack_cursor'),
    candidate_device_id: candidateDeviceId,
    desktop_max_state_seq: requireNumber(desktop.sync_state.max_state_seq, 'desktop_max_state_seq'),
    local_dirty_count: android.sync_state.local_dirty_count ?? 0,
    pending_ack_count: android.sync_state.pending_ack_count ?? 0,
    push_issue_count: android.sync_state.push_issue_count ?? 0
  };
}

export async function requestPrimaryDeviceTakeover(endpointUrl: string) {
  const pairing = await loadCompanionPairingState();
  if (!pairing.is_paired || !pairing.device_id) {
    throw new Error('This device must be paired before becoming primary.');
  }
  const convergence = await runSyncConvergenceCheck(endpointUrl);
  const payload = buildTakeoverPayload(pairing.device_id, convergence);
  const response = await postDesktopJson<NativePrimaryDeviceTakeoverResponse>(
    endpointUrl,
    PRIMARY_DEVICE_TAKEOVER_PATH,
    payload
  );
  await saveLocalPrimaryDeviceId(response.primary_device_id);
  return response;
}

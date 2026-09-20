import { isDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { hasActiveReadwiseKeepImportRuns } from '../import/keepImportRunnerOwner.js';
import { cancelReadwiseApiImport, isReadwiseApiImportActive } from '../import/readwiseApiImportRun.js';
import { beginReadwiseExecutionStop, endReadwiseExecutionStop } from '../import/readwiseExecutionBarrier.js';

export const READWISE_OWNER_STOP_PATH = '/companion/readwise-owner-stop';

export interface ReadwiseStopRequest {
  epoch: number;
  groupId: string;
  mode: 'api' | 'relay';
  ownerId: string | null;
  requestId: string;
  targetId: string;
}

let pendingStop: Omit<ReadwiseStopRequest, 'requestId'> | null = null;

function parseRequest(bodyText: string): ReadwiseStopRequest {
  let value: Record<string, unknown>;
  try { value = JSON.parse(bodyText) as Record<string, unknown>; }
  catch { throw new Error('readwise_stop_invalid'); }
  if (!value || !Number.isSafeInteger(value.epoch) || Number(value.epoch) < 0 ||
      typeof value.groupId !== 'string' || !value.groupId ||
      !['api', 'relay'].includes(String(value.mode)) ||
      !(value.ownerId === null || typeof value.ownerId === 'string') ||
      typeof value.requestId !== 'string' || !value.requestId ||
      typeof value.targetId !== 'string' || !value.targetId) throw new Error('readwise_stop_invalid');
  return value as unknown as ReadwiseStopRequest;
}

function sameStop(left: Omit<ReadwiseStopRequest, 'requestId'>, right: ReadwiseStopRequest) {
  return left.groupId === right.groupId && left.mode === right.mode &&
    left.ownerId === right.ownerId && left.targetId === right.targetId && left.epoch === right.epoch;
}

export function handleReadwiseOwnerStop(bodyText: string, senderId: string) {
  const request = parseRequest(bodyText);
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== request.groupId || senderId !== request.targetId) {
    throw new Error('readwise_stop_not_group_desktop');
  }
  const localId = group.local_device_identity_key;
  const localMember = group.devices.find((device) => device.device_identity_key === localId);
  const targetMember = group.devices.find((device) => device.device_identity_key === request.targetId);
  if (
      !localMember || localMember.state !== 'active' || !isDesktopSyncGroupPlatform(localMember.platform) ||
      !targetMember || targetMember.state !== 'active' || !isDesktopSyncGroupPlatform(targetMember.platform)) {
    throw new Error('readwise_stop_not_group_desktop');
  }
  const assignment = loadReadwiseHostAssignment();
  const mode = loadReadwiseSourceModeState().mode;
  if (mode !== request.mode || assignment.active_device_identity_key !== request.ownerId ||
      assignment.active_owner_epoch !== request.epoch ||
      (request.ownerId && request.ownerId !== localId)) throw new Error('readwise_stop_state_changed');
  if (pendingStop && !sameStop(pendingStop, request)) throw new Error('readwise_stop_competing_request');
  const existing = loadReadwiseOwnerGuard(group.group_id);
  if (existing && existing.epoch > request.epoch) throw new Error('readwise_stop_epoch_regressed');
  if (existing?.state === 'relinquished') {
    if (existing.ownerId !== (request.ownerId ?? localId) || existing.epoch !== request.epoch ||
        existing.targetId !== request.targetId) throw new Error('readwise_stop_already_relinquished');
    return stopped(request, localId);
  }
  pendingStop = { epoch: request.epoch, groupId: request.groupId, mode: request.mode,
    ownerId: request.ownerId, targetId: request.targetId };
  beginReadwiseExecutionStop(group.group_id);
  cancelReadwiseApiImport();
  if (isReadwiseApiImportActive() || hasActiveReadwiseKeepImportRuns()) {
    return { status: 'pending' as const, requestId: request.requestId };
  }
  saveReadwiseOwnerGuard({ epoch: request.epoch, groupId: request.groupId, mode: request.mode,
    ownerId: request.ownerId ?? localId, state: 'relinquished', targetId: request.targetId });
  return stopped(request, localId);
}

function stopped(request: ReadwiseStopRequest, localId: string) {
  return { status: 'stopped' as const, epoch: request.epoch, groupId: request.groupId,
    mode: request.mode, oldDeviceId: localId, ownerId: request.ownerId,
    requestId: request.requestId, targetId: request.targetId };
}

export function resumeReadwiseExecutionAfterActivation() {
  pendingStop = null;
  endReadwiseExecutionStop();
}

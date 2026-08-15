import type { NativeCompanionBootstrapState } from '../../../../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import {
  createSyncParticipationSnapshot,
  type SyncParticipationSnapshot
} from '../../../../../lib/platform/syncParticipationContract';
import { loadAppVersion } from '../../appVersion';
import {
  FolioleCompanionSync,
  isNativeCompanionSyncGroupRuntime,
  isNativeCompanionSyncParticipationRuntime
} from '../../companionWorkspaceRuntimeRepository';

import { ensureCompanionSyncGroupDataOwner } from './syncGroupProviderDataOwner';

export interface CompanionSyncGroupServiceHint {
  endpoint_url: string;
}

const participationListeners = new Set<() => void>();
let participationSnapshot = createSyncParticipationSnapshot({
  lifecycle_active: true, sync_enabled: true, sync_paused: false
});

function publishParticipation(next: SyncParticipationSnapshot) {
  participationSnapshot = createSyncParticipationSnapshot(next);
  participationListeners.forEach((listener) => listener());
  return participationSnapshot;
}

export function getCompanionSyncParticipationSnapshot() {
  return participationSnapshot;
}

export function subscribeCompanionSyncParticipation(listener: () => void) {
  participationListeners.add(listener);
  return () => participationListeners.delete(listener);
}

export async function reconcileCompanionSyncGroupProvider(
  bootstrap: NativeCompanionBootstrapState,
  group: SyncGroupPayload | null,
  factsRevision = '0'
) {
  if (!isNativeCompanionSyncGroupRuntime()) return null;
  if (!group || group.local_member_state !== 'active' || !bootstrap.database_path) {
    return FolioleCompanionSync.stopSyncGroupProvider();
  }
  const localMember = group.members.find((member) => member.device_id === group.local_device_id);
  if (!localMember) throw new Error('sync_group_member_not_authorized');
  await ensureCompanionSyncGroupDataOwner();
  return FolioleCompanionSync.startSyncGroupProvider({
    app_version: await loadAppVersion(),
    device_id: localMember.device_id,
    device_name: localMember.device_name,
    facts_revision: factsRevision,
    sync_group: group
  });
}

export async function subscribeCompanionSyncGroupServiceHint(
  listener: (hint: CompanionSyncGroupServiceHint) => void
) {
  if (!isNativeCompanionSyncGroupRuntime()) return () => undefined;
  const eventSource = FolioleCompanionSync as typeof FolioleCompanionSync & {
    addListener(
      eventName: 'syncGroupServiceHint', next: (hint: CompanionSyncGroupServiceHint) => void
    ): Promise<{ remove(): Promise<void> }>;
  };
  const handle = await eventSource.addListener('syncGroupServiceHint', listener);
  return () => { void handle.remove(); };
}

export function loadCompanionSyncGroupProviderState() {
  return FolioleCompanionSync.loadSyncGroupProviderState();
}

export async function loadCompanionSyncParticipationState() {
  if (!isNativeCompanionSyncParticipationRuntime()) return participationSnapshot;
  return publishParticipation(await FolioleCompanionSync.loadSyncParticipationState());
}

export async function setCompanionSyncEnabled(enabled: boolean) {
  return publishParticipation(await FolioleCompanionSync.setSyncEnabled({ sync_enabled: enabled }));
}

export async function setCompanionSyncPaused(paused: boolean) {
  return publishParticipation(await FolioleCompanionSync.setSyncPaused({ sync_paused: paused }));
}

export function approveCompanionSyncGroupJoinRequest(pairRequestId: string) {
  return FolioleCompanionSync.approveSyncGroupJoinRequest({ pair_request_id: pairRequestId });
}

export function rejectCompanionSyncGroupJoinRequest(pairRequestId: string) {
  return FolioleCompanionSync.rejectSyncGroupJoinRequest({ pair_request_id: pairRequestId });
}

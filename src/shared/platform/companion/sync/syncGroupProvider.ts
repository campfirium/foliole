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
  if (!group || !bootstrap.database_path) {
    return FolioleCompanionSync.stopSyncGroupProvider();
  }
  const localDevice = group.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
  if (!localDevice) throw new Error('sync_group_local_device_missing');
  await ensureCompanionSyncGroupDataOwner();
  return FolioleCompanionSync.startSyncGroupProvider({
    app_version: await loadAppVersion(),
    device_id: localDevice.device_identity_key,
    device_name: localDevice.device_name,
    platform: localDevice.platform,
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

export async function subscribeCompanionSyncGroupProviderState(
  listener: (state: import('../../companionWorkspaceSyncPluginTypes').CompanionSyncGroupProviderState) => void
) {
  if (!isNativeCompanionSyncGroupRuntime()) return () => undefined;
  const eventSource = FolioleCompanionSync as typeof FolioleCompanionSync & {
    addListener(
      eventName: 'syncGroupProviderStateChanged', next: typeof listener
    ): Promise<{ remove(): Promise<void> }>;
  };
  const handle = await eventSource.addListener('syncGroupProviderStateChanged', listener);
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

export function acceptCompanionSyncGroupJoinRequest(requestId: string) {
  return FolioleCompanionSync.acceptSyncGroupJoinRequest({ request_id: requestId });
}

export function rejectCompanionSyncGroupJoinRequest(requestId: string) {
  return FolioleCompanionSync.rejectSyncGroupJoinRequest({ request_id: requestId });
}

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { getCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { reconcileCompanionSyncGroupProvider } from '../shared/platform/companion/sync/syncGroupProvider';
import { isNativeCompanionSyncGroupRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { publishCompanionSyncGroupProviderAvailability } from './companionSyncGroupProviderAvailability';

export async function startCompanionSyncGroupProviderLifecycle(
  bootstrapState: NativeCompanionBootstrapState,
  group: SyncGroupPayload | null,
  factsRevision: string
) {
  await reconcileCompanionSyncGroupProvider(bootstrapState, group, factsRevision);
}

export async function ensureCompanionSyncGroupProviderForPublicAction(
  bootstrapState: NativeCompanionBootstrapState,
  group: SyncGroupPayload | null,
  lastSyncedAt: string | null
) {
  if (!isNativeCompanionSyncGroupRuntime()) return;
  if (!group || group.local_member_state !== 'active') {
    throw new Error('sync_group_provider_not_ready');
  }
  publishCompanionSyncGroupProviderAvailability(false);
  const factsRevision = `${getCompanionSyncMutationRevision()}:${lastSyncedAt ?? ''}`;
  await startCompanionSyncGroupProviderLifecycle(bootstrapState, group, factsRevision);
  publishCompanionSyncGroupProviderAvailability(true);
}

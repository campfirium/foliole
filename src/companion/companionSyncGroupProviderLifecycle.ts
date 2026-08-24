import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { getCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { reconcileCompanionSyncGroupProvider } from '../shared/platform/companion/sync/syncGroupProvider';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
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
  lastSyncedAt: string | null
) {
  if (!isNativeCompanionSyncGroupRuntime()) return;
  publishCompanionSyncGroupProviderAvailability(false);
  const group = await loadCompanionSyncGroup();
  const factsRevision = `${getCompanionSyncMutationRevision()}:${lastSyncedAt ?? ''}`;
  await startCompanionSyncGroupProviderLifecycle(bootstrapState, group, factsRevision);
  publishCompanionSyncGroupProviderAvailability(true);
}

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import {
  getCompanionSyncMutationRevision,
  subscribeCompanionSyncMutationRevision
} from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import {
  isNativeCompanionSyncGroupRuntime,
  isNativeCompanionSyncGroupStoreRuntime
} from '../shared/platform/companionWorkspaceRuntimeRepository';

import { publishCompanionSyncGroupProviderAvailability } from './companionSyncGroupProviderAvailability';
import { startCompanionSyncGroupProviderLifecycle } from './companionSyncGroupProviderLifecycle';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const CompanionSyncGroupContext = createContext<SyncGroupPayload | null>(null);

export function CompanionSyncGroupRuntime(props: {
  bootstrapState: NativeCompanionBootstrapState;
  children: ReactNode;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const { bootstrapState, workspaceSync } = props;
  const [group, setGroup] = useState<SyncGroupPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mutationRevision = useSyncExternalStore(
    subscribeCompanionSyncMutationRevision,
    getCompanionSyncMutationRevision,
    getCompanionSyncMutationRevision
  );

  useEffect(() => {
    if (!isNativeCompanionSyncGroupStoreRuntime()) return;
    setLoaded(false);
    void Promise.resolve().then(loadCompanionSyncGroup).then((next) => {
      setGroup(next);
      setLoaded(true);
    }).catch(() => {
      setGroup(null);
      setLoaded(true);
    });
  }, [bootstrapState.runtime_kind, workspaceSync.pairingState.is_paired,
    workspaceSync.state.last_synced_at]);

  useEffect(() => {
    if (!isNativeCompanionSyncGroupRuntime()) {
      publishCompanionSyncGroupProviderAvailability(true);
      return;
    }
    if (!loaded) return;
    let cancelled = false;
    const factsRevision = `${mutationRevision}:${workspaceSync.state.last_synced_at ?? ''}`;
    publishCompanionSyncGroupProviderAvailability(false);
    void startCompanionSyncGroupProviderLifecycle(
      bootstrapState, group, factsRevision
    ).then(() => {
      if (!cancelled) publishCompanionSyncGroupProviderAvailability(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [bootstrapState, group, loaded, mutationRevision, workspaceSync.state.last_synced_at]);

  return (
    <CompanionSyncGroupContext.Provider value={group}>
      {props.children}
    </CompanionSyncGroupContext.Provider>
  );
}

export function useCompanionSyncGroupRuntime() {
  return useContext(CompanionSyncGroupContext);
}

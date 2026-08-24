import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import {
  getCompanionSyncMutationRevision,
  subscribeCompanionSyncMutationRevision
} from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { reconcileCompanionSyncGroupProvider } from '../shared/platform/companion/sync/syncGroupProvider';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import {
  isNativeCompanionSyncGroupRuntime,
  isNativeCompanionSyncGroupStoreRuntime
} from '../shared/platform/companionWorkspaceRuntimeRepository';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

interface CompanionSyncGroupRuntimeValue {
  group: SyncGroupPayload | null;
  providerAvailable: boolean;
}

const CompanionSyncGroupContext = createContext<CompanionSyncGroupRuntimeValue>({
  group: null,
  providerAvailable: true
});

export function CompanionSyncGroupRuntime(props: {
  bootstrapState: NativeCompanionBootstrapState;
  children: ReactNode;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const { bootstrapState, workspaceSync } = props;
  const [group, setGroup] = useState<SyncGroupPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [providerAvailable, setProviderAvailable] = useState(false);
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
      setProviderAvailable(true);
      return;
    }
    if (!loaded) return;
    let cancelled = false;
    const factsRevision = `${mutationRevision}:${workspaceSync.state.last_synced_at ?? ''}`;
    setProviderAvailable(false);
    void reconcileCompanionSyncGroupProvider(
      bootstrapState, group, factsRevision
    ).then(() => {
      if (!cancelled) setProviderAvailable(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [bootstrapState, group, loaded, mutationRevision, workspaceSync.pairingState,
    workspaceSync.state.last_synced_at]);

  return (
    <CompanionSyncGroupContext.Provider value={{ group, providerAvailable }}>
      {props.children}
    </CompanionSyncGroupContext.Provider>
  );
}

export function useCompanionSyncGroupRuntime() {
  return useContext(CompanionSyncGroupContext);
}

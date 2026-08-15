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
    if (!isNativeCompanionSyncGroupRuntime() || !loaded) return;
    const factsRevision = `${mutationRevision}:${workspaceSync.state.last_synced_at ?? ''}`;
    void reconcileCompanionSyncGroupProvider(bootstrapState, group, factsRevision).catch(() => undefined);
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

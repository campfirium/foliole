import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

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
  const providerGroupRef = useRef<SyncGroupPayload | null>(null);
  const mutationRevision = useSyncExternalStore(
    subscribeCompanionSyncMutationRevision,
    getCompanionSyncMutationRevision,
    getCompanionSyncMutationRevision
  );
  const providerIdentity = group
    ? `${group.group_id}:${group.local_device_identity_key}`
    : 'none';
  if (providerIdentity !== (providerGroupRef.current
    ? `${providerGroupRef.current.group_id}:${providerGroupRef.current.local_device_identity_key}`
    : 'none')) providerGroupRef.current = group;

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
  }, [bootstrapState.runtime_kind, mutationRevision, workspaceSync.state.last_synced_at]);

  useEffect(() => {
    if (!isNativeCompanionSyncGroupRuntime() || !loaded) return;
    void reconcileCompanionSyncGroupProvider(
      bootstrapState, providerGroupRef.current,
      workspaceSync.syncParticipation.participating
    ).catch((error) => {
      console.error('[companion-sync-group] provider reconciliation failed', error);
    });
  }, [bootstrapState, loaded, providerIdentity, workspaceSync.syncParticipation.participating]);

  return (
    <CompanionSyncGroupContext.Provider value={group}>
      {props.children}
    </CompanionSyncGroupContext.Provider>
  );
}

export function useCompanionSyncGroupRuntime() {
  return useContext(CompanionSyncGroupContext);
}

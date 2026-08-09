import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { reconcileCompanionSyncGroupProvider } from '../shared/platform/companion/sync/syncGroupProvider';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const CompanionSyncGroupContext = createContext<SyncGroupPayload | null>(null);

export function CompanionSyncGroupRuntime(props: {
  children: ReactNode;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const { workspaceSync } = props;
  const [group, setGroup] = useState<SyncGroupPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (workspaceSync.bootstrapState.runtime_kind !== 'android-capacitor') return;
    setLoaded(false);
    void loadCompanionSyncGroup().then((next) => {
      setGroup(next);
      setLoaded(true);
    }).catch(() => {
      setGroup(null);
      setLoaded(true);
    });
  }, [workspaceSync.bootstrapState.runtime_kind, workspaceSync.pairingState.is_paired,
    workspaceSync.state.last_synced_at]);

  useEffect(() => {
    if (workspaceSync.bootstrapState.runtime_kind !== 'android-capacitor' || !loaded) return;
    void reconcileCompanionSyncGroupProvider(workspaceSync.bootstrapState, group).catch(() => undefined);
  }, [group, loaded, workspaceSync.bootstrapState]);

  return (
    <CompanionSyncGroupContext.Provider value={group}>
      {props.children}
    </CompanionSyncGroupContext.Provider>
  );
}

export function useCompanionSyncGroupRuntime() {
  return useContext(CompanionSyncGroupContext);
}

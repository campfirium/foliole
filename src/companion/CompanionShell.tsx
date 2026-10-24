import { useEffect } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { cancelRetiredHandoffNotifications } from '../shared/platform/companionHandoffNotifications';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { CompanionRestoredShell } from './CompanionRestoredShell';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export type { CompanionShellModel } from './CompanionRestoredShell';

export function CompanionShell(props: { bootstrapState: NativeCompanionBootstrapState }) {
  useEffect(() => {
    void cancelRetiredHandoffNotifications().catch((error) => {
      logRuntimeError('Retired reminder cancellation failed', { area: 'native', action: 'cancel-retired-reminders', error });
    });
  }, []);
  const workspaceSync = useCompanionWorkspaceSync(props.bootstrapState);
  const snapshot = workspaceSync.state.workspace_snapshot;
  return <CompanionNavigationProvider ready={workspaceSync.isWorkspaceSyncStateReady} snapshot={snapshot}
    libraryScope={snapshot?.libraryScope ?? props.bootstrapState.database_path ?? 'preview'}>
    <CompanionRestoredShell bootstrapState={props.bootstrapState} workspaceSync={workspaceSync} />
  </CompanionNavigationProvider>;
}

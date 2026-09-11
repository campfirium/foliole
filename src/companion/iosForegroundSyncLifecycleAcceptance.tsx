import { App } from '@capacitor/app';
import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';
import { postResult } from './iosBridgeAcceptance';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

function ForegroundSyncLifecycleShell({ bootstrap }: { bootstrap: NativeCompanionBootstrapState }) {
  const readyPosted = useRef(false);
  const workspaceSync = useCompanionWorkspaceSync(bootstrap);

  useEffect(() => {
    if (readyPosted.current) return;
    if (workspaceSync.isWorkspaceSyncStateReady && workspaceSync.state.endpoint_url &&
        workspaceSync.syncGroupJoined && workspaceSync.state.last_synced_at !== null && workspaceSync.status === 'idle') {
      readyPosted.current = true;
      postReady(workspaceSync);
      return;
    }
    postProgress('shell-state', {
      endpoint_ready: Boolean(workspaceSync.state.endpoint_url),
      participation_hydrated: workspaceSync.syncParticipation.hydrated,
      state_ready: workspaceSync.isWorkspaceSyncStateReady,
      sync_enabled: workspaceSync.syncParticipation.sync_enabled,
      sync_group_joined: workspaceSync.syncGroupJoined,
      sync_paused: workspaceSync.syncParticipation.sync_paused,
      sync_status: workspaceSync.status
    });
  }, [workspaceSync.error, workspaceSync.isWorkspaceSyncStateReady, workspaceSync.syncGroupJoined,
    workspaceSync.state.endpoint_url, workspaceSync.state.last_synced_at, workspaceSync.status,
    workspaceSync.syncParticipation.hydrated, workspaceSync.syncParticipation.sync_enabled,
    workspaceSync.syncParticipation.sync_paused]);

  return null;
}

function postReady(workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>) {
  postResult({
    error: null,
    sync_group_joined: workspaceSync.syncGroupJoined,
    phase: 'ready',
    scenario: 'foreground-sync-lifecycle',
    sync_error: workspaceSync.error,
    sync_status: workspaceSync.status,
    status: 'passed'
  });
}

function postProgress(stage: string, details: Record<string, unknown> = {}) {
  postResult({ ...details, error: null, phase: 'paired', scenario: 'foreground-sync-lifecycle', stage, status: 'passed' });
}

async function prepareAcceptanceGroup(bootstrap: NativeCompanionBootstrapState) {
  const joined = await ensureIosAcceptanceSyncGroup(bootstrap.database_path);
  await saveCompanionWorkspaceSyncEndpoint(joined.endpointUrl);
}

async function installLifecycleEvidence() {
  let activeCount = 0;
  let pauseCount = 0;
  let resumeCount = 0;
  await Promise.all([
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      activeCount += 1;
      postResult({ active_count: activeCount, error: null, pause_count: pauseCount, phase: 'foreground',
        resume_count: resumeCount, scenario: 'foreground-sync-lifecycle', status: 'passed' });
    }),
    App.addListener('pause', () => {
      pauseCount += 1;
      postResult({ active_count: activeCount, error: null, pause_count: pauseCount, phase: 'background',
        resume_count: resumeCount, scenario: 'foreground-sync-lifecycle', status: 'passed' });
    }),
    App.addListener('resume', () => {
      resumeCount += 1;
      postResult({ active_count: activeCount, error: null, pause_count: pauseCount, phase: 'foreground',
        resume_count: resumeCount, scenario: 'foreground-sync-lifecycle', status: 'passed' });
    })
  ]);
}

export async function runIosForegroundSyncLifecycleAcceptance(rootElement: HTMLElement) {
  try {
    const bootstrap = await loadCompanionBootstrapState();
    postProgress('bootstrap-loaded');
    await prepareAcceptanceGroup(bootstrap);
    postProgress('group-prepared');
    await installLifecycleEvidence();
    postProgress('listeners-installed');
    ReactDOM.createRoot(rootElement).render(<ForegroundSyncLifecycleShell bootstrap={bootstrap} />);
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'foreground-sync-lifecycle',
      status: 'failed'
    });
  }
}

import { App } from '@capacitor/app';
import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import {
  loadCompanionPairingState
} from '../shared/platform/companionWorkspacePairing';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { pairIosAcceptanceCompanion } from './iosAcceptancePairing';
import { acceptanceEndpoint, postResult } from './iosBridgeAcceptance';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

function ForegroundSyncLifecycleShell({ bootstrap }: { bootstrap: NativeCompanionBootstrapState }) {
  const initialSyncStarted = useRef(false);
  const workspaceSync = useCompanionWorkspaceSync(bootstrap);

  useEffect(() => {
    if (initialSyncStarted.current || !workspaceSync.isWorkspaceSyncStateReady || !workspaceSync.state.endpoint_url ||
      workspaceSync.pairingState.sync_usable !== true) return;
    initialSyncStarted.current = true;
    const endpoint = workspaceSync.state.endpoint_url;
    if (workspaceSync.state.last_synced_at !== null) {
      postReady(workspaceSync);
      return;
    }
    void workspaceSync.pullFromDesktop(endpoint).then(() => {
      postReady(workspaceSync);
    }).catch((error) => {
      postResult({
        error: error instanceof Error ? error.message : String(error),
        phase: 'failed',
        scenario: 'foreground-sync-lifecycle',
        status: 'failed'
      });
    });
  }, [workspaceSync.error, workspaceSync.isWorkspaceSyncStateReady, workspaceSync.pairingState,
    workspaceSync.pullFromDesktop, workspaceSync.state.endpoint_url, workspaceSync.state.last_synced_at,
    workspaceSync.status]);

  return null;
}

function postReady(workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>) {
  postResult({
    error: null,
    pairing_is_paired: workspaceSync.pairingState.is_paired,
    pairing_sync_usable: workspaceSync.pairingState.sync_usable,
    phase: 'ready',
    scenario: 'foreground-sync-lifecycle',
    sync_error: workspaceSync.error,
    sync_status: workspaceSync.status,
    status: 'passed'
  });
}

async function prepareAcceptancePairing(bootstrap: NativeCompanionBootstrapState, endpoint: string) {
  const pairing = await loadCompanionPairingState();
  if (!pairing.is_paired) {
    const hostName = bootstrap.host_name ?? 'Acceptance iPhone';
    await pairIosAcceptanceCompanion(endpoint, hostName);
  }
  await saveCompanionWorkspaceSyncEndpoint(endpoint);
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
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS foreground sync lifecycle acceptance endpoint is unavailable.');
    const bootstrap = await loadCompanionBootstrapState();
    await prepareAcceptancePairing(bootstrap, endpoint);
    await installLifecycleEvidence();
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

import React from 'react';
import ReactDOM from 'react-dom/client';

import '../app/styles.css';
import { installCompanionSyncInstrumentationProbe } from '../shared/platform/companionSyncInstrumentationProbe';
import { StartupErrorBoundary } from '../shared/ui/StartupErrorBoundary';

import { CompanionApp } from './CompanionApp';
import { installCompanionWebViewCompatibilityPolyfills } from './companionWebViewCompatibility';
import type { AcceptanceResult } from './iosBridgeAcceptance';

installCompanionWebViewCompatibilityPolyfills();
installCompanionSyncInstrumentationProbe();

const isIosBridgeAcceptance = import.meta.env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE === '1';
const iosAcceptanceScenario = import.meta.env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO;
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in companion entry.');
}

if (isIosBridgeAcceptance) {
  const module = iosAcceptanceScenario === 'foreground-sync-lifecycle'
    ? import('./iosForegroundSyncLifecycleAcceptance').then(({ runIosForegroundSyncLifecycleAcceptance }) =>
      runIosForegroundSyncLifecycleAcceptance(rootElement))
    : iosAcceptanceScenario === 'content-resource-read'
    ? import('./iosContentResourceAcceptance').then(({ runIosContentResourceAcceptance }) => runIosContentResourceAcceptance())
    : iosAcceptanceScenario === 'state-writeback-runtime'
      ? import('./iosStateWritebackAcceptance').then(({ runIosStateWritebackAcceptance }) => runIosStateWritebackAcceptance())
    : iosAcceptanceScenario === 'database-upgrade-runtime'
      ? import('./iosDatabaseUpgradeAcceptance').then(({ runIosDatabaseUpgradeAcceptance }) => runIosDatabaseUpgradeAcceptance())
    : iosAcceptanceScenario === 'device-identity'
      ? import('./iosDeviceIdentityAcceptance').then(({ runIosDeviceIdentityAcceptance }) =>
        runIosDeviceIdentityAcceptance())
    : iosAcceptanceScenario === 'sync-pack-runtime'
      ? import('./iosSyncPackAcceptance').then(({ runIosSyncPackAcceptance }) => runIosSyncPackAcceptance())
    : iosAcceptanceScenario === 'sync-group-discovery-events'
      ? import('./iosSyncGroupDiscoveryAcceptance').then(({ runIosSyncGroupDiscoveryAcceptance }) =>
        runIosSyncGroupDiscoveryAcceptance())
    : iosAcceptanceScenario === 'sync-trigger-runtime'
      ? import('./iosSyncTriggerAcceptance').then(({ runIosSyncTriggerAcceptance }) =>
        runIosSyncTriggerAcceptance())
      : import('./iosBridgeAcceptance').then(({ runIosBridgeAcceptance }) => runIosBridgeAcceptance());
  void module.catch((error) => {
    window.webkit?.messageHandlers?.folioleBridgeAcceptance?.postMessage({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: (iosAcceptanceScenario ?? 'pairing-signed-transport') as AcceptanceResult['scenario'],
      status: 'failed'
    });
  });
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StartupErrorBoundary moduleLabel="Companion renderer">
        <CompanionApp />
      </StartupErrorBoundary>
    </React.StrictMode>
  );
}

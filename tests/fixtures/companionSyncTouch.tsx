import { Capacitor, registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';

// Only the native boundary is replaced; layout, touch targets and controls are production code.
Capacitor.getPlatform = () => 'android';
Capacitor.isNativePlatform = () => true;
let enabled = true;
const participation = () => ({ lifecycle_active: true, sync_enabled: enabled,
  sync_paused: false, participating: enabled });
registerPlugin('FolioleCompanionSync', { web: () => ({
  loadSyncParticipationState: async () => participation(),
  setSyncEnabled: async (args: { sync_enabled: boolean }) => {
    enabled = args.sync_enabled;
    return participation();
  }
}) });
registerPlugin('App', { web: () => ({
  addListener: async () => ({ remove: async () => undefined })
}) });
const { CompanionSyncPanel } = await import('../../src/companion/CompanionSyncPanel');
const { LocalizationProvider } = await import('../../src/shared/localization/LocalizationProvider');
const { SettingsTouchSurface } = await import('../../src/shared/ui/SettingsTouchSurface');

function SyncSettings() {
  const [searches, setSearches] = useState(0);
  const noop = async () => undefined;
  return <main className="relative mx-auto max-w-md p-4">
    <SettingsTouchSurface>
      <CompanionSyncPanel bootstrapState={{ booted_at: '2026-11-07', database_path: null,
        database_ready: false, device_id: 'touch-fixture', runtime_kind: 'android-capacitor' }}
        discoveries={[]} endpointUrl={null} error={null} joinRequest={null}
        joinStatus={searches ? 'discovering' : 'idle'} lastSyncedAt={null}
        rememberedTargets={[]} syncConflictCount={0} syncEvents={[]} syncProgress={null}
        syncGroup={null} onCancelJoin={noop} onClearError={noop}
        onDiscover={async () => { setSearches(value => value + 1); }}
        onLeaveSyncGroup={noop} onPull={noop} onRemoveRememberedTarget={noop}
        onRequestJoin={noop} onSaveEndpoint={noop} onOpenSettingsPage={noop}
        page="sync" status="idle" />
      <output aria-label="Search requests">{searches}</output>
    </SettingsTouchSurface>
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><SyncSettings /></LocalizationProvider>
);

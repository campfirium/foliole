import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncPanel } from './CompanionSyncPanel';

it('uses the action-local terminal result instead of a waiting discovery message', () => {
  renderWithLocalization(
    <CompanionSyncPanel
      bootstrapState={{
        booted_at: '', database_path: null, database_ready: true, device_id: 'device-1',
        runtime_kind: 'ios-capacitor'
      }}
      discoveries={[]}
      endpointUrl="http://desktop:38641"
      error="discovery_waiting_anchor"
      handoffReminderSettings={{ fixedTime: null, shortDelay: 'off' }}
      joinRequest={null}
      joinStatus="idle"
      lastSyncedAt={null}
      manualSyncAction={{
        runId: 'offline-run', started: true, status: 'terminal', terminalResult: 'failed'
      }}
      rememberedTargets={[]}
      syncConflictCount={0}
      syncEvents={[]}
      syncProgress={null}
      syncGroup={{
        created_at: '', devices: [], display_name: 'Studio', group_id: 'group-1',
        local_device_identity_key: 'device-1'
      }}
      onCancelJoin={vi.fn()}
      onChangeHandoffReminderSettings={vi.fn()}
      onClearError={vi.fn()}
      onDiscover={vi.fn()}
      onLeaveSyncGroup={vi.fn()}
      onOpenSettingsPage={vi.fn()}
      onPull={vi.fn()}
      onRemoveRememberedTarget={vi.fn()}
      onRequestJoin={vi.fn()}
      onSaveEndpoint={vi.fn()}
      page="sync"
      status="idle"
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Sync failed.');
  expect(screen.queryByText('Waiting for a desktop Sync anchor.')).not.toBeInTheDocument();
  expect(screen.queryByTestId('companion-sync-error')).not.toBeInTheDocument();
});

import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionSyncGroupAdoptionRun } from '../shared/platform/companion/sync/companionSyncGroupAdoptionRun';

import { CompanionSyncPanel } from './CompanionSyncPanel';

const adoption = vi.hoisted(() => ({ run: { phase: 'none' } as CompanionSyncGroupAdoptionRun }));
vi.mock('./useCompanionSyncGroupAdoptionRun', () => ({
  useCompanionSyncGroupAdoptionRun: () => adoption.run
}));

function panel(joinStatus: 'idle' | 'adopting' = 'idle') {
  return <CompanionSyncPanel
    bootstrapState={{ booted_at: '', database_path: null, database_ready: true,
      device_id: 'device-1', runtime_kind: 'android-capacitor' }}
    discoveries={[{
      appVersion: '0.8.2', compatibility: { status: 'compatible' } as never,
      endpointUrl: 'http://desktop:38641', groupDisplayName: 'Studio',
      groupId: 'group-1', groupTag: 'tag-1', providerDeviceId: 'mac',
      providerDeviceName: 'Studio', providerPlatform: 'macOS'
    }]}
    endpointUrl={null}
    error={null}
    joinRequest={null}
    joinStatus={joinStatus}
    lastSyncedAt={null}
    rememberedTargets={[]}
    syncConflictCount={0}
    syncEvents={[]}
    syncProgress={null}
    syncGroup={null}
    onCancelJoin={vi.fn()}
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
  />;
}

it('hides discovery throughout approved reception and restores it once reception ends', () => {
  const { rerender } = renderWithLocalization(panel());
  expect(screen.getByRole('button', { name: 'Join group-1' })).toBeVisible();

  rerender(panel('adopting'));
  expect(screen.getByTestId('companion-sync-receiving')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Join group-1' })).not.toBeInTheDocument();

  adoption.run = { phase: 'receiving', completed: 47, total: 100, lastActivityAt: null, error: null };
  rerender(panel());
  expect(screen.getByText('Received 47 of 100')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Join group-1' })).not.toBeInTheDocument();

  adoption.run = { phase: 'none' };
  rerender(panel());
  expect(screen.getByRole('button', { name: 'Join group-1' })).toBeVisible();
});

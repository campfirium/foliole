import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';

it.each(['ios-capacitor', 'ios'])('shows %s Device records as iOS', (deviceKind) => {
  renderWithLocalization(
    <CompanionSyncStatusDetails
      endpointUrl="http://192.168.1.10:38641"
      lastSyncedAt={null}
      onOpenPage={vi.fn()}
      page="syncConnection"
      syncGroup={{
        created_at: '2026-07-20T00:00:00.000Z', display_name: 'Roamer', group_id: 'group-ios',
        local_device_identity_key: 'device-ios', devices: [{
          canonical_library_path: '/library', contract_version: 1, device_anchor: 'anchor-ios',
          device_identity_key: 'device-ios', device_name: "Roamer's iPhone", joined_at: '2026-07-20T00:00:00.000Z',
          last_seen_at: null, left_at: null, platform: deviceKind, state: 'active', updated_at: '2026-07-20T00:00:00.000Z'
        }]
      }}
      status="idle"
      syncConflictCount={0}
      syncEvents={[]}
      syncProgress={null}
    />
  );

  expect(screen.getByText("Roamer's iPhone")).toBeInTheDocument();
  expect(screen.queryByText(new RegExp(`\\(${deviceKind}\\)`))).not.toBeInTheDocument();
});

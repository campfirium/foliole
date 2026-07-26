import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';

it.each(['ios-capacitor', 'ios'])('shows %s pairing records as iOS', (deviceKind) => {
  renderWithLocalization(
    <CompanionSyncStatusDetails
      endpointUrl="http://192.168.1.10:38641"
      lastSyncedAt={null}
      onOpenPage={vi.fn()}
      page="syncConnection"
      pairingState={{
        device_id: 'ios-device',
        device_kind: deviceKind,
        device_name: "Roamer's iPhone",
        is_paired: true,
        paired_at: '2026-07-20T00:00:00.000Z',
        primary_device_id: 'ios-device'
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

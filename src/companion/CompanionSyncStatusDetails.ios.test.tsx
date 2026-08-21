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
        authorization_id: 'authorization-ios',
        host_name: "Roamer's iPhone",
        host_platform: deviceKind,
        is_paired: true,
        paired_at: '2026-07-20T00:00:00.000Z'
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

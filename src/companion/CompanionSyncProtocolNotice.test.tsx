import { fireEvent, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncProtocolNotice } from './CompanionSyncProtocolNotice';

it('shows a background sync rejection outside the sync settings page only once', () => {
  const { rerender } = renderWithLocalization(
    <CompanionSyncProtocolNotice error="protocol_incompatible"><p>Browse</p></CompanionSyncProtocolNotice>
  );
  expect(screen.getByText('Browse')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Cannot sync' })).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  rerender(<CompanionSyncProtocolNotice error={null}><p>Browse</p></CompanionSyncProtocolNotice>);
  rerender(<CompanionSyncProtocolNotice error="protocol_incompatible"><p>Browse</p></CompanionSyncProtocolNotice>);
  expect(screen.queryByRole('dialog', { name: 'Cannot sync' })).not.toBeInTheDocument();
});

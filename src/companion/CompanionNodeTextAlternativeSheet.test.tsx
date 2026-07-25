import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionNodeTextAlternativeSheet } from './CompanionNodeTextAlternativeSheet';

const alternative = {
  alternative_id: 'alternative-1',
  body_text: 'Other body',
  created_at: '2026-07-25T00:00:00.000Z',
  node_id: 'topic-1',
  source_device_id: 'android-device',
  source_version_id: 'android#1',
  status: 'available' as const,
  updated_at: '2026-07-25T00:00:00.000Z'
};

it('shows one simple alternate body with only ignore and set-as-body actions', () => {
  const onDismiss = vi.fn();
  const onSetAsBody = vi.fn();
  render(
    <CompanionNodeTextAlternativeSheet
      alternative={alternative}
      busy={false}
      currentBody="Current body"
      error={false}
      onDismiss={onDismiss}
      onOpenChange={vi.fn()}
      onSetAsBody={onSetAsBody}
      open
    />
  );

  expect(screen.getByText('Current body')).toBeInTheDocument();
  expect(screen.getByText('Other body')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set as body' }));
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(onSetAsBody).toHaveBeenCalledOnce();
  expect(screen.queryByText(/conflict|winner|loser/i)).not.toBeInTheDocument();
});

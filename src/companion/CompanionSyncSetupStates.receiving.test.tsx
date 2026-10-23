import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../shared/localization/LocalizationProvider', () => ({
  useTranslation: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key)
}));

import { ReceivingGroupDataState } from './CompanionSyncSetupStates';

const run = { completed: 1200, total: 6169, lastActivityAt: '2026-10-23T13:05:00.000Z', error: null };

it('shows how much group data has arrived and when it last moved', () => {
  render(<ReceivingGroupDataState onRetry={vi.fn()} run={{ ...run, phase: 'receiving' }} />);
  expect(screen.getByText('companion.syncSetup.receiving.progress {"completed":1200,"total":6169}')).toBeInTheDocument();
  expect(screen.getByText(/companion\.syncSetup\.receiving\.lastActivity/u)).toBeInTheDocument();
  expect(screen.queryByTestId('companion-sync-receiving-retry')).not.toBeInTheDocument();
});

it('explains a background pause and offers a retry after a failure', () => {
  const onRetry = vi.fn();
  const { rerender } = render(<ReceivingGroupDataState onRetry={onRetry} run={{ ...run, phase: 'paused' }} />);
  expect(screen.getByText('companion.syncSetup.receiving.paused')).toBeInTheDocument();
  rerender(<ReceivingGroupDataState onRetry={onRetry}
    run={{ ...run, phase: 'failed', error: 'sync_group_local_adoption_source_unavailable' }} />);
  expect(screen.getByText('companion.syncSetup.receiving.failed'))
    .toHaveAttribute('data-error-code', 'sync_group_local_adoption_source_unavailable');
  fireEvent.click(screen.getByTestId('companion-sync-receiving-retry'));
  expect(onRetry).toHaveBeenCalledOnce();
});

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ALL_READWISE_RECONCILE_SCOPE } from '../../lib/core/readwise/readwiseRemoteLifecycle';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { CompanionReadwiseRemoteStatus } from './CompanionReadwiseRemoteStatus';

function renderStatus(reader: 'missing' | 'present' | 'unconfirmed', exported: 'deleted' | 'present' | 'unconfirmed') {
  return render(<LocalizationProvider initialLanguagePreference="en">
    <CompanionReadwiseRemoteStatus lifecycle={{
      checkedAt: 'now', connectionRef: 'connection', export: exported, reader,
      scope: ALL_READWISE_RECONCILE_SCOPE
    }} />
  </LocalizationProvider>);
}

it('keeps fully present remote status silent', () => {
  renderStatus('present', 'present');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('distinguishes incomplete, Reader-missing, and Export-deleted facts', () => {
  const { rerender } = renderStatus('unconfirmed', 'unconfirmed');
  expect(screen.getByRole('status')).toHaveTextContent('latest full reconciliation did not finish');
  rerender(<LocalizationProvider initialLanguagePreference="en"><CompanionReadwiseRemoteStatus lifecycle={{
    checkedAt: 'now', connectionRef: 'connection', export: 'present', reader: 'missing',
    scope: ALL_READWISE_RECONCILE_SCOPE
  }} /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('missing from the fully checked Reader set');
  rerender(<LocalizationProvider initialLanguagePreference="en"><CompanionReadwiseRemoteStatus lifecycle={{
    checkedAt: 'now', connectionRef: 'connection', export: 'deleted', reader: 'present',
    scope: ALL_READWISE_RECONCILE_SCOPE
  }} /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('Readwise Export reports this source as deleted');
});

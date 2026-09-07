import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseApiImportSection } from './ReadwiseApiImportSection';

function renderSection(overrides: Partial<Parameters<typeof ReadwiseApiImportSection>[0]> = {}) {
  const props = {
    disabled: false, isRunning: false, onCancelReconcile: vi.fn(), onPreview: vi.fn(),
    onReconcile: vi.fn(), reconcileIsRunning: false, reconcileResult: null, ...overrides
  };
  render(<LocalizationProvider initialLanguagePreference="en">
    <ReadwiseApiImportSection {...props} />
  </LocalizationProvider>);
  return props;
}

it('starts explicit reconciliation independently from import preview', () => {
  const props = renderSection();
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile status' }));
  expect(props.onReconcile).toHaveBeenCalledOnce();
  expect(props.onPreview).not.toHaveBeenCalled();
});

it('shows the full-set result and exposes cancellation only while running', () => {
  const onCancelReconcile = vi.fn();
  renderSection({
    onCancelReconcile, reconcileIsRunning: true,
    reconcileResult: {
      export_deleted_count: 2, present_count: 3, reader_missing_count: 4,
      reconciled_at: 'now', status: 'completed', unconfirmed_count: 5
    }
  });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Present: 3; Reader missing: 4; Export deleted: 2; Unconfirmed: 5.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel reconciliation' }));
  expect(onCancelReconcile).toHaveBeenCalledOnce();
});

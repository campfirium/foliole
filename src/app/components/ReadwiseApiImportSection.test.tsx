import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const { loadScheduleStatus } = vi.hoisted(() => ({ loadScheduleStatus: vi.fn() }));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  loadReadwiseApiScheduleStatusInRuntime: loadScheduleStatus
}));

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseApiImportSection } from './ReadwiseApiImportSection';

loadScheduleStatus.mockResolvedValue({
  eligibility: 'first_import_required', last_result: null, next_run_at: null, running: false
});

function renderSection(overrides: Partial<Parameters<typeof ReadwiseApiImportSection>[0]> = {}) {
  const props = {
    disabled: false, frequency: 'hourly' as const, isRunning: false,
    onChangeFrequency: vi.fn(), onPreview: vi.fn(), ...overrides
  };
  render(<LocalizationProvider initialLanguagePreference="en">
    <ReadwiseApiImportSection {...props} />
  </LocalizationProvider>);
  return props;
}

it('keeps only import and automatic frequency tasks', async () => {
  renderSection();

  expect(screen.getByRole('button', { name: 'Preview import' })).toBeInTheDocument();
  expect(await screen.findByRole('combobox', { name: 'Sync frequency' })).toBeInTheDocument();
  expect(screen.queryByText('Remote status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reconcile status' })).not.toBeInTheDocument();
});

it('shows the failed stage and retries through the existing preview flow', async () => {
  loadScheduleStatus.mockResolvedValueOnce({
    eligibility: 'ready',
    last_result: {
      completed_at: '2026-09-08T12:00:00.000Z', error_stage: 'fetching',
      imported_count: 0, status: 'failed', trigger: 'scheduled'
    },
    next_run_at: null,
    running: false
  });
  const props = renderSection();

  const retry = await screen.findByRole('button', { name: 'Retry import' });
  expect(screen.getByText('The last import stopped while reading remote changes.')).toBeVisible();
  fireEvent.click(retry);
  expect(props.onPreview).toHaveBeenCalledOnce();
});

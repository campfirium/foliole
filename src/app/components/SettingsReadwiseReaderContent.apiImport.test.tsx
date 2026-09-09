import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const modeRuntime = vi.hoisted(() => ({ confirm: vi.fn(), preview: vi.fn() }));
const scheduleRuntime = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  connectReadwiseApiFromClipboardInRuntime: vi.fn(),
  disconnectReadwiseApiInRuntime: vi.fn(),
  loadReadwiseApiConnectionFromRuntime: vi.fn().mockResolvedValue({
    has_credential: false, state: 'disconnected', verified_at: null
  })
}));
vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: modeRuntime.preview,
  runReadwiseSourceCutoverInRuntime: vi.fn()
}));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  loadReadwiseApiScheduleStatusInRuntime: scheduleRuntime.load
}));
vi.mock('../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/ui')>(),
  requestAppConfirmation: modeRuntime.confirm
}));

it('keeps the original sync and cleanup rows without extra API sections', async () => {
  scheduleRuntime.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: { completed_count: 0, failed_count: 0, lifecycle: null, pending_count: 0, status: 'completed', total_count: null, unexplained_failure_count: 0 },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  modeRuntime.preview.mockResolvedValue({
    completed_count: 0, status: 'ready', topic_count: 4, total_count: null
  });
  modeRuntime.confirm.mockResolvedValue(true);
  render(
    <LocalizationProvider>
      <SettingsReadwiseReaderContent
        config={createDefaultReadwiseReaderConfig()}
        onPreviewSync={vi.fn()}
        onRunSync={vi.fn()}
        onSave={vi.fn()}
        readwiseRootPath=""
        readwiseSourceMode="api"
        readwiseSources={[]}
      />
    </LocalizationProvider>
  );

  expect(await screen.findByRole('combobox', { name: 'Sync frequency' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clean up...' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Automatic import' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import behavior' })).toBeInTheDocument();
  expect(screen.getByRole('radiogroup', { name: 'Highlighted content destination' })).toBeInTheDocument();
  expect(screen.getByRole('radiogroup', { name: 'Content without highlights destination' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Preview import' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect Readwise' })).toBeInTheDocument();
  expect(screen.queryByText('Migrate existing Topics')).not.toBeInTheDocument();
});

it('saves the API import frequency on the active desktop host', async () => {
  scheduleRuntime.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: { completed_count: 0, failed_count: 0, lifecycle: null, pending_count: 0, status: 'completed', total_count: null, unexplained_failure_count: 0 },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  const onSave = vi.fn();
  render(
    <LocalizationProvider>
      <SettingsReadwiseReaderContent
        config={createDefaultReadwiseReaderConfig()}
        onSave={onSave}
        readwiseRootPath=""
        readwiseSourceMode="api"
        readwiseSources={[]}
      />
    </LocalizationProvider>
  );

  fireEvent.change(await screen.findByRole('combobox', { name: 'Sync frequency' }), {
    target: { value: 'daily' }
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ syncFrequency: 'daily' })
  }));
});

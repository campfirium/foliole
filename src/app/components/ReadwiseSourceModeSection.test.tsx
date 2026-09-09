import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';

const runtime = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), load: vi.fn() }));
const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));
const navigation = vi.hoisted(() => ({ open: vi.fn() }));
const schedule = vi.hoisted(() => ({ load: vi.fn() }));

function apiSettings() {
  return {
    cleanupDisabled: false,
    config: createDefaultReadwiseReaderConfig(),
    onChangeFrequency: vi.fn(),
    onCleanup: vi.fn(),
    onSync: vi.fn(),
    syncDisabled: false,
    syncIsRunning: false,
    syncStatus: { failedSources: [], message: null, tone: 'normal' as const }
  };
}

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  connectReadwiseApiFromClipboardInRuntime: runtime.connect,
  disconnectReadwiseApiInRuntime: runtime.disconnect,
  loadReadwiseApiConnectionFromRuntime: runtime.load
}));
vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutover.preview,
  runReadwiseSourceCutoverInRuntime: cutover.run
}));
vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl: navigation.open }));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  loadReadwiseApiScheduleStatusInRuntime: schedule.load
}));
vi.mock('../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/ui')>(),
  requestAppConfirmation: confirmation.request
}));

beforeEach(() => {
  vi.clearAllMocks();
  runtime.load.mockResolvedValue({ has_credential: false, state: 'disconnected', verified_at: null });
  runtime.connect.mockResolvedValue({
    connection: { has_credential: true, state: 'connected', verified_at: '2026-09-07T00:00:00.000Z' },
    status: 'connected'
  });
  cutover.preview.mockResolvedValue({
    completed_count: 0, status: 'ready', topic_count: 12, total_count: null
  });
  cutover.run.mockResolvedValue({ migrated_count: 10, status: 'completed', unmatched_count: 2 });
  confirmation.request.mockResolvedValue(true);
  schedule.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: { completed_count: 0, failed_count: 0, lifecycle: null, pending_count: 0, status: 'completed', total_count: null, unexplained_failure_count: 0 },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
});

it('shows Off, Obsidian relay, and API as one source selector', async () => {
  const onChange = vi.fn();
  const onCommitMode = vi.fn();
  render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection committedMode="folder" mode="folder" onChange={onChange} onCommitMode={onCommitMode} />
    </LocalizationProvider>
  );

  expect(screen.getByRole('radio', { name: 'Off' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Obsidian relay import' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'API mode' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
  expect(onChange).toHaveBeenCalledWith('off');
  expect(onCommitMode).toHaveBeenCalledWith('off');
});

it('opens migration confirmation from API selection without a separate migration row', async () => {
  const onChange = vi.fn();
  render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection committedMode="folder" mode="folder" onChange={onChange} />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  await waitFor(() => expect(confirmation.request).toHaveBeenCalledWith(expect.objectContaining({
    confirmLabel: 'Switch and migrate',
    description: expect.arrayContaining([
      '12 Topics were imported through the current Obsidian relay folders on this device.'
    ])
  })));
  expect(onChange).toHaveBeenCalledWith('api');
  expect(screen.queryByText('Migrate existing Topics')).not.toBeInTheDocument();
});

it('keeps the token link in the description and connects without exposing it to the renderer', async () => {
  render(<LocalizationProvider><ReadwiseSourceModeSection apiSettings={apiSettings()} committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Get Readwise token' })).toHaveClass('underline');
  fireEvent.click(screen.getByRole('button', { name: 'Connect Readwise' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  expect(runtime.connect).toHaveBeenCalledWith('continue', 'normal');

  fireEvent.click(screen.getByRole('button', { name: 'Get Readwise token' }));
  expect(navigation.open).toHaveBeenCalledWith('https://readwise.io/access_token');
});

it('shows the migration status in the API connection row while migration is pending', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, status: 'migration_in_progress', topic_count: 12, total_count: 31
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiSettings={apiSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('combobox', { name: 'Sync frequency' })).toBeInTheDocument();
  const migration = await screen.findByRole('button', { name: 'Migrating to API mode 0%' });
  expect(migration).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('offers to continue migration when the migration is paused', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 7, status: 'migration_in_progress', topic_count: 12, total_count: 31
  });
  cutover.run.mockResolvedValue({ migrated_count: 7, status: 'failed', unmatched_count: 0 });
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiSettings={apiSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  await waitFor(() => expect(cutover.run).toHaveBeenCalled());
  const migration = await screen.findByRole('button', { name: 'Continue migrating to API mode 22%' });
  expect(migration).not.toHaveAttribute('aria-busy', 'true');
});

it('shows completed cutover and the failed initial sync as separate tasks', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 31, status: 'already_completed', topic_count: 31, total_count: 31
  });
  schedule.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: { completed_count: 29, failed_count: 2, lifecycle: null, pending_count: 0, status: 'failed', total_count: 31, unexplained_failure_count: 2 },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiSettings={apiSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByText('Migration: 31/31 completed.')).toBeInTheDocument();
  expect(screen.getByText(/First sync: 29\/31 completed; 2 failed/)).toBeInTheDocument();
  expect(screen.getByText('Routine sync: starts after the first sync completes.')).toBeInTheDocument();
  expect(screen.queryByText(/Migrating to API mode/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry 2 failed' })).toBeEnabled();
});

it('uses the same instruction for a missing or invalid token', async () => {
  runtime.connect.mockResolvedValue({
    connection: { has_credential: false, state: 'disconnected', verified_at: null },
    status: 'token_missing'
  });
  render(<LocalizationProvider><ReadwiseSourceModeSection apiSettings={apiSettings()} committedMode="folder" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Connect Readwise' }));
  expect(await screen.findByText('Copy your Readwise token to the clipboard first.')).toBeInTheDocument();
  expect(runtime.connect).toHaveBeenCalledWith('continue', 'migration');
  expect(screen.queryByText('Migrate existing Topics')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Switch to API mode' })).not.toBeInTheDocument();
});

it('locks the source selector after the API cutover', async () => {
  const onChange = vi.fn();
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="api" mode="api" onChange={onChange} /></LocalizationProvider>);

  const folderMode = await screen.findByRole('radio', { name: 'Obsidian relay import' });
  expect(folderMode).toBeDisabled();
  fireEvent.click(folderMode);
  expect(onChange).not.toHaveBeenCalled();
});

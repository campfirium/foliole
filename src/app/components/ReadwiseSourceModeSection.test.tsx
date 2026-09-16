import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';
import { createReadwiseApiModeTestSettings } from './ReadwiseSourceModeSection.testSupport';

const runtime = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), load: vi.fn() }));
const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));
const navigation = vi.hoisted(() => ({ open: vi.fn() }));
const schedule = vi.hoisted(() => ({ load: vi.fn() }));

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
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 12, total_count: null
  });
  cutover.run.mockResolvedValue({ error_reason: null, migrated_count: 10, status: 'completed', unmatched_count: 2 });
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
      <ReadwiseSourceModeSection committedMode="relay" mode="relay" onChange={onChange} onCommitMode={onCommitMode} />
    </LocalizationProvider>
  );

  expect(screen.getByRole('radio', { name: 'Off' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Obsidian relay' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'API mode' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
  expect(onChange).toHaveBeenCalledWith('off');
  expect(onCommitMode).toHaveBeenCalledWith('off');
});

it('opens API setup from source selection before migration', async () => {
  const onChange = vi.fn();
  const onCommitMode = vi.fn();
  render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection committedMode="relay" mode="relay" onChange={onChange} onCommitMode={onCommitMode} />
    </LocalizationProvider>
  );

  await waitFor(() => expect(cutover.preview).toHaveBeenCalledTimes(1));
  cutover.preview.mockClear();
  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  await waitFor(() => expect(confirmation.request).toHaveBeenCalledWith(expect.objectContaining({
    confirmLabel: 'Continue setup',
    description: expect.arrayContaining([
      'Review each import rule below and connect Readwise. The defaults include PDFs and EPUBs; adjust them as needed.'
    ])
  })));
  expect(onChange).toHaveBeenCalledWith('api');
  expect(onCommitMode).not.toHaveBeenCalled();
  expect(cutover.preview).not.toHaveBeenCalled();
  expect(cutover.run).not.toHaveBeenCalled();
});

it('keeps the token link in the description and connects without exposing it to the renderer', async () => {
  render(<LocalizationProvider><ReadwiseSourceModeSection apiSettings={createReadwiseApiModeTestSettings()} committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Get Readwise token' })).toHaveClass('underline');
  fireEvent.click(screen.getByRole('button', { name: 'Connect Readwise' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  expect(runtime.connect).toHaveBeenCalledWith('normal');

  fireEvent.click(screen.getByRole('button', { name: 'Get Readwise token' }));
  expect(navigation.open).toHaveBeenCalledWith('https://readwise.io/access_token');
});

it('does not render a disconnected state before the saved credential is restored', async () => {
  let restore!: (value: { has_credential: boolean; state: 'connected'; verified_at: string }) => void;
  runtime.load.mockReturnValue(new Promise((resolve) => { restore = resolve; }));
  render(<LocalizationProvider><ReadwiseSourceModeSection apiSettings={createReadwiseApiModeTestSettings()} committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect Readwise' })).not.toBeInTheDocument();
  restore({ has_credential: true, state: 'connected', verified_at: '2026-09-10T00:00:00.000Z' });
  expect(await screen.findByText('Connected')).toBeInTheDocument();
});

it('keeps indexing visible while the remote total is not known yet', async () => {
  runtime.load.mockResolvedValue({ has_credential: true, state: 'connected', verified_at: 'now' });
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: 'indexing', status: 'migration_in_progress', topic_count: 12, total_count: null
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted
    apiSettings={createReadwiseApiModeTestSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('combobox', { name: 'Sync frequency' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByText(/^Readwise migration · Downloading/)).toHaveLength(2));
  expect(screen.getByText('Readwise migration · Downloading · 0')).toBeInTheDocument();
  expect(screen.queryByText(/0 \/ 12/)).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disconnect' })).not.toHaveAttribute('aria-busy');
});

it('restores merging progress and explains a paused migration in place', async () => {
  runtime.load.mockResolvedValue({ has_credential: true, state: 'connected', verified_at: 'now' });
  cutover.preview.mockResolvedValue({
    completed_count: 7, error_reason: 'request_failed', phase: 'merging', status: 'migration_in_progress', topic_count: 12, total_count: 31
  });
  cutover.run.mockResolvedValue({ error_reason: 'request_failed', migrated_count: 7, status: 'failed', unmatched_count: 0 });
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted
    apiSettings={createReadwiseApiModeTestSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  await waitFor(() => expect(cutover.preview).toHaveBeenCalled());
  expect(cutover.run).not.toHaveBeenCalled();
  expect(await screen.findByText('Readwise migration · Update failed · 7 / 31 · Readwise request failed')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry migration' }));
  await waitFor(() => expect(cutover.run).toHaveBeenCalledOnce());
});

it('keeps migration indexing separate from the ordinary sync action', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 31, error_reason: null, phase: null, status: 'already_completed', topic_count: 31, total_count: 31
  });
  schedule.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'in_progress', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: { completed_count: 29, failed_count: 2, lifecycle: null, pending_count: 0, status: 'failed', total_count: 31, unexplained_failure_count: 2 },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  const settings = createReadwiseApiModeTestSettings();
  settings.syncIsRunning = true;
  settings.syncStatus = { failedSources: [], message: 'Syncing Readwise sources...', tone: 'normal' };
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiSettings={settings}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('button', { name: 'Sync now' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sync now' })).not.toHaveAttribute('aria-busy');
  expect(screen.queryByText(/Migration:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/First sync:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Routine sync:/)).not.toBeInTheDocument();
  expect(screen.queryByText('Syncing Readwise sources...')).not.toBeInTheDocument();
  expect(screen.getByText('Readwise migration · Downloading')).toBeInTheDocument();
});

it('keeps migration visible while the initial import is incomplete, regardless of failure', async () => {
  schedule.load.mockResolvedValue({
    cutover: { completed_count: 31, failed_count: 0, pending_count: 0, status: 'in_progress', total_count: 31, unexplained_failure_count: 0 },
    eligibility: 'ready',
    initial_sync: {
      completed_count: 0, failed_count: 0, pending_count: 0, status: 'failed', total_count: null,
      unexplained_failure_count: 0,
      lifecycle: {
        error_reason: 'rate_limited', finished_at: '2026-09-11T00:00:02.000Z', kind: 'initial',
        progress: null, queued_at: '2026-09-11T00:00:00.000Z', run_id: 'failed-run',
        stage: 'fetching', started_at: '2026-09-11T00:00:01.000Z', status: 'failed', trigger: 'manual'
      }
    },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  const settings = createReadwiseApiModeTestSettings();
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiSettings={settings}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('button', { name: 'Sync now' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sync now' })).not.toHaveAttribute('aria-busy');
  const migrationStatus = screen.getByRole('status');
  expect(migrationStatus).toHaveTextContent('Readwise migration · Downloading');
  expect(migrationStatus).not.toHaveTextContent('failed');
  expect(migrationStatus.querySelector('.animate-spin')).not.toBeNull();
  expect(screen.getByRole('radiogroup', { name: 'Readwise source mode' }).parentElement).toContainElement(migrationStatus);
});

it('uses the same instruction for a missing or invalid token', async () => {
  runtime.connect.mockResolvedValue({
    connection: { has_credential: false, state: 'disconnected', verified_at: null },
    status: 'token_missing'
  });
  render(<LocalizationProvider><ReadwiseSourceModeSection apiSettings={createReadwiseApiModeTestSettings()} committedMode="relay" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Connect Readwise' }));
  expect(await screen.findByText('Copy your Readwise token to the clipboard first.')).toBeInTheDocument();
  expect(runtime.connect).toHaveBeenCalledWith('migration');
  expect(screen.getByRole('button', { name: 'Migrate to API mode…' })).toBeDisabled();
  expect(screen.getByText('Connect Readwise first.')).toBeInTheDocument();
});

it('locks the retired relay choice after the API cutover', async () => {
  const onChange = vi.fn();
  render(<LocalizationProvider><ReadwiseSourceModeSection apiMigrationCompleted committedMode="api" mode="api" onChange={onChange} /></LocalizationProvider>);

  const folderMode = await screen.findByRole('radio', { name: 'Obsidian relay' });
  expect(folderMode).toBeDisabled();
  fireEvent.click(folderMode);
  expect(onChange).not.toHaveBeenCalled();
});

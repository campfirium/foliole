import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';

const runtime = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), load: vi.fn() }));
const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));
const navigation = vi.hoisted(() => ({ open: vi.fn() }));

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
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Get Readwise token' })).toHaveClass('underline');
  fireEvent.click(screen.getByRole('button', { name: 'Connect Readwise' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  expect(runtime.connect).toHaveBeenCalledWith('continue', 'normal');

  fireEvent.click(screen.getByRole('button', { name: 'Get Readwise token' }));
  expect(navigation.open).toHaveBeenCalledWith('https://readwise.io/access_token');
});

it('shows an inline spinner while migration progress is pending', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, status: 'migration_in_progress', topic_count: 12, total_count: 31
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  const migration = await screen.findByRole('button', { name: 'Migrating to API mode 0%' });
  expect(migration).toHaveAttribute('aria-busy', 'true');
  expect(migration.querySelector('.animate-spin')).toBeInTheDocument();
});

it('uses the same instruction for a missing or invalid token', async () => {
  runtime.connect.mockResolvedValue({
    connection: { has_credential: false, state: 'disconnected', verified_at: null },
    status: 'token_missing'
  });
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="folder" mode="api" onChange={() => undefined} /></LocalizationProvider>);

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

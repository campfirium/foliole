import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';

const runtime = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), load: vi.fn() }));
const cutoverRuntime = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));
const navigation = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  connectReadwiseApiFromClipboardInRuntime: runtime.connect,
  disconnectReadwiseApiInRuntime: runtime.disconnect,
  loadReadwiseApiConnectionFromRuntime: runtime.load
}));
vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutoverRuntime.preview,
  runReadwiseSourceCutoverInRuntime: cutoverRuntime.run
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
  cutoverRuntime.preview.mockResolvedValue({ status: 'ready', topic_count: 12 });
  cutoverRuntime.run.mockResolvedValue({ migrated_count: 10, status: 'completed', unmatched_count: 2 });
  confirmation.request.mockResolvedValue(true);
});

it('connects from the clipboard without exposing the token to the renderer', async () => {
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="api" mode="api" onChange={() => undefined} /></LocalizationProvider>);

  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect Readwise' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  expect(runtime.connect).toHaveBeenCalledWith('continue', 'normal');

  fireEvent.click(screen.getByRole('button', { name: 'Get Readwise token' }));
  expect(navigation.open).toHaveBeenCalledWith('https://readwise.io/access_token');
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
});

it('previews and performs the one-way cutover only after confirmation', async () => {
  const onChange = vi.fn();
  const onCutoverCompleted = vi.fn();
  const { rerender } = render(
    <LocalizationProvider><ReadwiseSourceModeSection committedMode="folder" mode="folder" onChange={onChange} /></LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  expect(onChange).toHaveBeenCalledWith('api');
  rerender(
    <LocalizationProvider>
      <ReadwiseSourceModeSection committedMode="folder" mode="api" onChange={onChange} onCutoverCompleted={onCutoverCompleted} />
    </LocalizationProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to API mode' }));

  await waitFor(() => expect(cutoverRuntime.run).toHaveBeenCalledTimes(1));
  expect(confirmation.request).toHaveBeenCalledWith(expect.objectContaining({
    confirmLabel: 'Switch and migrate',
    description: expect.arrayContaining(['12 Topics were imported through the current Obsidian relay folders on this device.'])
  }));
  expect(onCutoverCompleted).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('10 Topics were migrated; 2 unmatched Topics remain as local content.')).toBeInTheDocument();
});

it('locks the source selector after the API cutover', async () => {
  const onChange = vi.fn();
  render(<LocalizationProvider><ReadwiseSourceModeSection committedMode="api" mode="api" onChange={onChange} /></LocalizationProvider>);

  const folderMode = await screen.findByRole('radio', { name: 'Obsidian relay import' });
  expect(folderMode).toBeDisabled();
  fireEvent.click(folderMode);
  expect(onChange).not.toHaveBeenCalled();
});

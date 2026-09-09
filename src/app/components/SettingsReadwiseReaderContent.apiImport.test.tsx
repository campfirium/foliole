import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { createReadwiseImportPreview } from './readwiseReaderSettingsTestSupport';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const modeRuntime = vi.hoisted(() => ({ confirm: vi.fn(), preview: vi.fn() }));

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
vi.mock('../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/ui')>(),
  requestAppConfirmation: modeRuntime.confirm
}));

it('shows API preview and sync controls immediately after confirmed selection', async () => {
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
        readwiseSourceMode="folder"
        readwiseSources={[]}
      />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  expect(await screen.findByRole('button', { name: 'Preview import' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect Readwise' })).toBeInTheDocument();
  expect(screen.queryByText('Migrate existing Topics')).not.toBeInTheDocument();
});

it('previews and completes all API candidates in one sync', async () => {
  const onPreviewSync = vi.fn().mockResolvedValue({
    ...createReadwiseImportPreview(), batch_count: 1, estimated_seconds: 2,
    mode: 'api', remaining_count: 1, total_count: 1
  });
  const onRunSync = vi.fn().mockResolvedValue({
    committed_count: 1, completed_at: '2026-09-07T00:00:00.000Z', failed_count: 0,
    imported_count: 1, remaining_count: 0, source_count: 1, status: 'completed'
  });
  render(
    <LocalizationProvider>
      <SettingsReadwiseReaderContent
        config={createDefaultReadwiseReaderConfig()}
        onPreviewSync={onPreviewSync}
        onRunSync={onRunSync}
        onSave={vi.fn()}
        readwiseRootPath=""
        readwiseSourceMode="api"
        readwiseSources={[]}
      />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
  expect(await screen.findByRole('dialog', { name: 'Readwise import preview' })).toBeInTheDocument();
  expect(screen.getByText('Source topics: 1 · This sync: 1 · About 2s to import · Pending: 1'))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => expect(onRunSync).toHaveBeenCalledTimes(1));
  expect(onPreviewSync).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Readwise import preview' })).not.toBeInTheDocument());
});

it('saves the API automatic import frequency on the active desktop host', async () => {
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

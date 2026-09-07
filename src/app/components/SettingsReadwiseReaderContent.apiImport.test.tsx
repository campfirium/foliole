import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { createReadwiseImportPreview } from './readwiseReaderSettingsTestSupport';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('previews and continues API imports in explicit 50-parent batches', async () => {
  const onPreviewSync = vi.fn().mockResolvedValue({
    ...createReadwiseImportPreview(), batch_count: 1, estimated_seconds: 2,
    mode: 'api', remaining_count: 1, total_count: 1
  });
  const onRunSync = vi.fn().mockResolvedValue({
    committed_count: 1, completed_at: '2026-09-07T00:00:00.000Z', failed_count: 0,
    imported_count: 1, remaining_count: 1, source_count: 2, status: 'paused'
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
  expect(screen.getByText('Source topics: 1 · Next batch: 1 · About 2s to import · Pending: 1'))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => expect(onRunSync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onPreviewSync).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog', { name: 'Readwise import preview' })).toBeInTheDocument();
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

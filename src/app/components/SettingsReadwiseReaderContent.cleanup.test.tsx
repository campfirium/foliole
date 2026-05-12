import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import {
  createReadwiseCleanupPreview,
  createReadwiseCleanupRunResult
} from './readwiseReaderSettingsTestSupport';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('previews and runs Readwise cleanup from the setup action row', async () => {
  const onPreviewCleanup = vi.fn().mockResolvedValue(createReadwiseCleanupPreview());
  const onRunCleanup = vi.fn().mockResolvedValue(createReadwiseCleanupRunResult());
  const onSave = vi.fn();

  render(
    <SettingsReadwiseReaderContent
      config={{
        ...createDefaultReadwiseReaderConfig(),
        enabled: true,
        validatedAt: '2026-05-11T00:00:00.000Z'
      }}
      onPreviewCleanup={onPreviewCleanup}
      onRunCleanup={onRunCleanup}
      onSave={onSave}
      readwiseRootPath="/Readwise"
      readwiseSources={createReadwiseImportSources('/Readwise')}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Clean up...' })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Clean up...' }));

  expect(
    await screen.findByRole('dialog', { name: 'Clean up Readwise imports' })
  ).toBeInTheDocument();
  expect(screen.getByText('1 will be deleted')).toBeInTheDocument();
  expect(screen.getByText('Plain')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clean up' }));

  await waitFor(() => {
    expect(onRunCleanup).toHaveBeenCalledTimes(1);
  });
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ enabled: false }),
      readwiseSources: expect.arrayContaining([
        expect.objectContaining({ kind: 'articles', keepState: 'draft' })
      ])
    })
  );
});

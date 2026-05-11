import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const { inspectReadwiseReaderSetup } = vi.hoisted(() => ({
  inspectReadwiseReaderSetup: vi.fn()
}));

vi.mock('./readwiseReaderSetupInspection', () => ({
  inspectReadwiseReaderSetup
}));

it('checks Readwise setup inline and turns on the integration from the settings panel', async () => {
  const onSave = vi.fn();
  const config = createDefaultReadwiseReaderConfig();
  const readwiseSources = createReadwiseImportSources('/Readwise');
  inspectReadwiseReaderSetup.mockResolvedValue({
    checkedSourceCount: 1,
    detectedHighlightCount: 1,
    highlightedArticleCount: 1,
    matchedHighlightCount: 1,
    message: 'Checked 1 source topic successfully.',
    sampleCount: 1,
    samples: [
      {
        excerpt: 'A useful highlighted passage appears in the source topic.',
        highlightText: 'highlighted passage',
        matched: true,
        sourceName: 'Sample source topic'
      }
    ],
    success: true,
    totalArticleCount: 1
  });

  render(
    <SettingsReadwiseReaderContent
      config={config}
      onSave={onSave}
      readwiseRootPath="/Readwise"
      readwiseSources={readwiseSources}
    />
  );

  expect(screen.queryByRole('dialog', { name: 'Readwise preview' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Check setup' }));

  await waitFor(() => {
    expect(screen.getByText('Ready to enable')).toBeInTheDocument();
  });
  expect(screen.getByText('highlighted passage')).toBeInTheDocument();
  expect(inspectReadwiseReaderSetup).toHaveBeenCalledWith(
    expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({ label: 'Articles' }),
        expect.objectContaining({ label: 'Books' }),
        expect.objectContaining({ label: 'Tweets' }),
        expect.objectContaining({ label: 'Podcasts' })
      ])
    })
  );
  expect(onSave).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('switch', { name: 'Readwise Reader integration' }));

  expect(onSave).toHaveBeenCalledTimes(2);
  const saved = onSave.mock.calls[1][0] as { config: typeof config; readwiseSources: DraftImportSource[] };
  expect(saved.config.validatedAt).not.toBe('');
  expect(saved.readwiseSources.filter((source) => source.kind).every((source) => source.keepState === 'enabled')).toBe(true);
});

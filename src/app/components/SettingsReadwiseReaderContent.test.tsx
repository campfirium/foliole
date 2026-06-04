import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import {
  createEnabledReadwiseConfig,
  createReadwiseImportPreview,
  createReadwiseImportRunResult
} from './readwiseReaderSettingsTestSupport';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const { inspectReadwiseReaderSetup } = vi.hoisted(() => ({
  inspectReadwiseReaderSetup: vi.fn()
}));

vi.mock('./readwiseReaderSetupInspection', () => ({
  inspectReadwiseReaderSetup
}));

function mockSuccessfulSetupInspection() {
  inspectReadwiseReaderSetup.mockResolvedValue({
    checkedSourceCount: 1,
    detectedHighlightCount: 1,
    highlightOnlySourceCount: 0,
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
    totalArticleCount: 1,
    unparsedHighlightFileCount: 0
  });
}

function renderReadwiseSettingsHarness(input: { config?: ReadwiseReaderConfig } = {}) {
  const onSave = vi.fn();
  const onPreviewSync = vi.fn().mockResolvedValue(createReadwiseImportPreview());
  const onRunSync = vi.fn().mockResolvedValue(createReadwiseImportRunResult());
  const config = input.config ?? createDefaultReadwiseReaderConfig();
  const readwiseSources = createReadwiseImportSources('/Readwise');

  render(
    <LocalizationProvider>
      <SettingsReadwiseReaderContent
        config={config}
        onPreviewSync={onPreviewSync}
        onRunSync={onRunSync}
        onSave={onSave}
        readwiseRootPath="/Readwise"
        readwiseSources={readwiseSources}
      />
    </LocalizationProvider>
  );
  return { onPreviewSync, onRunSync, onSave };
}

async function checkSetupPreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await waitFor(() => {
    expect(
      screen.getByText('Checked 1 highlight file and 1 full document file.')
    ).toBeInTheDocument();
  });
}

it('checks Readwise setup inline and turns on the integration from the settings panel', async () => {
  mockSuccessfulSetupInspection();
  const { onPreviewSync, onRunSync, onSave } = renderReadwiseSettingsHarness();

  expect(screen.queryByRole('dialog', { name: 'Readwise import preview' })).not.toBeInTheDocument();
  await checkSetupPreview();
  expect(screen.getByText('Import preview')).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole('switch', { name: 'Readwise import' }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Readwise import preview' })).toBeInTheDocument();
  });
  expect(onPreviewSync).toHaveBeenCalledWith(
    expect.objectContaining({ readwiseRootPath: '/Readwise' })
  );
  expect(onSave).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(onRunSync).toHaveBeenCalledTimes(1);
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  const saved = onRunSync.mock.calls[0]![0] as {
    config: ReadwiseReaderConfig;
    readwiseSources: DraftImportSource[];
  };
  expect(saved.config.enabled).toBe(true);
  expect(saved.config.validatedAt).not.toBe('');
  expect(
    saved.readwiseSources
      .filter((source) => source.kind)
      .every((source) => source.keepState === 'enabled')
  ).toBe(true);
});

it('keeps the import preview divider aligned with settings rows', () => {
  renderReadwiseSettingsHarness();

  const previewSection = screen.getByText('Import preview').closest('section');

  expect(previewSection?.className.split(' ')).not.toContain('border-b');
  expect(previewSection?.className).toContain('after:left-5');
  expect(previewSection?.className).toContain('after:right-5');
  expect(previewSection?.className).toContain('after:border-b');
});

it('explains why Readwise import cannot turn on before import preview', async () => {
  const { onPreviewSync, onRunSync, onSave } = renderReadwiseSettingsHarness();

  fireEvent.click(screen.getByRole('switch', { name: 'Readwise import' }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Preview the import first' })).toBeInTheDocument();
  });
  expect(
    screen.getByText(
      'Import preview needs to be run and confirmed before Readwise import can be turned on.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  expect(onPreviewSync).not.toHaveBeenCalled();
  expect(onRunSync).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
});

it('keeps Readwise import off when the enable preview is cancelled', async () => {
  mockSuccessfulSetupInspection();
  const { onRunSync, onSave } = renderReadwiseSettingsHarness();
  await checkSetupPreview();

  fireEvent.click(screen.getByRole('switch', { name: 'Readwise import' }));
  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Readwise import preview' })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Readwise import preview' })).not.toBeInTheDocument();
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onRunSync).not.toHaveBeenCalled();
});

it('runs manual Readwise sync without opening the preview confirmation', async () => {
  const { onPreviewSync, onRunSync, onSave } = renderReadwiseSettingsHarness({
    config: createEnabledReadwiseConfig()
  });

  fireEvent.click(screen.getByRole('button', { name: 'Sync' }));

  await waitFor(() => {
    expect(onRunSync).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole('dialog', { name: 'Readwise import preview' })).not.toBeInTheDocument();
  expect(onPreviewSync).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Synced 1 Readwise source topic.')).toBeInTheDocument();
});

it('previews changed import behavior before running manual Readwise sync', async () => {
  const { onPreviewSync, onRunSync, onSave } = renderReadwiseSettingsHarness({
    config: {
      ...createEnabledReadwiseConfig(),
      withoutHighlightsDestination: 'off'
    }
  });
  const withoutHighlightsGroup = screen.getByRole('radiogroup', {
    name: 'Without highlights destination'
  });

  fireEvent.click(within(withoutHighlightsGroup).getByRole('radio', { name: 'External' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sync' }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Readwise import preview' })).toBeInTheDocument();
  });
  expect(onPreviewSync).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ withoutHighlightsDestination: 'external' })
    })
  );
  expect(onRunSync).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(onRunSync).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ withoutHighlightsDestination: 'external' })
      })
    );
  });
  expect(onSave).not.toHaveBeenCalled();
  expect(onRunSync).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ withoutHighlightsDestination: 'external' })
    })
  );
});

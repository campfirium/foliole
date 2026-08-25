import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

vi.mock('../../shared/platform/folderSelectionRuntimeRepository', () => ({
  selectRuntimeFolder: vi.fn()
}));

function expectReadwisePathsMoved(sources: ReturnType<typeof createReadwiseImportSources>) {
  expect(sources.map((source) => [source.kind, source.highlightPath, source.primaryPath])).toEqual([
    ['articles', '/Library/Readwise/clip/Articles', '/Library/Readwise/clip/Full Document Contents/Articles'],
    ['books', '/Library/Readwise/clip/Books', '/Library/Readwise/clip/Full Document Contents/Books'],
    ['tweets', '/Library/Readwise/clip/Tweets', '/Library/Readwise/clip/Full Document Contents/Tweets'],
    ['podcasts', '/Library/Readwise/clip/Podcasts', '/Library/Readwise/clip/Full Document Contents/Podcasts']
  ]);
}

it('moves every Readwise category folder when the root folder changes', async () => {
  vi.mocked(selectRuntimeFolder).mockResolvedValue('/Library/Readwise/clip');
  const config = {
    ...createDefaultReadwiseReaderConfig(),
    enabled: true,
    validatedAt: '2026-08-01T00:00:00.000Z'
  };
  const readwiseSources = createReadwiseImportSources('/Library/Readwise/old');
  const onPathsChange = vi.fn();
  const { result, unmount } = renderHook(() =>
    useReadwiseSetupDraft({
      config,
      onPathsChange,
      onPreview: vi.fn(),
      open: true,
      readwiseRootPath: '/Library/Readwise/old',
      readwiseSources
    })
  );

  await act(async () => result.current.chooseRootFolder());

  expect(result.current.draftConfig).toEqual(
    expect.objectContaining({ enabled: false, validatedAt: '' })
  );
  expect(result.current.draftRootPath).toBe('/Library/Readwise/clip');
  expectReadwisePathsMoved(result.current.draftSources);
  expect(onPathsChange).toHaveBeenCalledWith({
    config: result.current.draftConfig,
    readwiseRootPath: result.current.draftRootPath,
    readwiseSources: result.current.draftSources
  });

  const saved = onPathsChange.mock.calls[0]![0];
  unmount();
  const reopened = renderHook(() =>
    useReadwiseSetupDraft({
      config: saved.config,
      onPathsChange,
      onPreview: vi.fn(),
      open: true,
      readwiseRootPath: saved.readwiseRootPath,
      readwiseSources: saved.readwiseSources
    })
  );
  expect(reopened.result.current.draftRootPath).toBe('/Library/Readwise/clip');
});

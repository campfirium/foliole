import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

vi.mock('../../shared/platform/folderSelectionRuntimeRepository', () => ({
  selectRuntimeFolder: vi.fn()
}));

it('moves every Readwise category folder when the root folder changes', async () => {
  vi.mocked(selectRuntimeFolder).mockResolvedValue('/Library/Readwise/clip');
  const config = createDefaultReadwiseReaderConfig();
  const readwiseSources = createReadwiseImportSources('/Library/Readwise/old');
  const { result } = renderHook(() =>
    useReadwiseSetupDraft({
      config,
      onPreview: vi.fn(),
      open: true,
      readwiseRootPath: '/Library/Readwise/old',
      readwiseSources
    })
  );

  await act(async () => result.current.chooseRootFolder());

  expect(result.current.draftRootPath).toBe('/Library/Readwise/clip');
  expect(result.current.draftSources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        highlightPath: '/Library/Readwise/clip/Articles',
        kind: 'articles',
        primaryPath: '/Library/Readwise/clip/Full Document Contents/Articles'
      }),
      expect.objectContaining({
        highlightPath: '/Library/Readwise/clip/Books',
        kind: 'books',
        primaryPath: '/Library/Readwise/clip/Full Document Contents/Books'
      }),
      expect.objectContaining({
        highlightPath: '/Library/Readwise/clip/Tweets',
        kind: 'tweets',
        primaryPath: '/Library/Readwise/clip/Full Document Contents/Tweets'
      }),
      expect.objectContaining({
        highlightPath: '/Library/Readwise/clip/Podcasts',
        kind: 'podcasts',
        primaryPath: '/Library/Readwise/clip/Full Document Contents/Podcasts'
      })
    ])
  );
});

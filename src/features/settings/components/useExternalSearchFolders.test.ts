import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import {
  getExternalFolderRuntimeProvider,
  installExternalFolderRuntimeProvider,
  resetExternalFolderRuntimeProviderForTest
} from '../../../shared/platform/externalFolderRuntime';
import {
  createDraftExternalSourceFolder,
  loadExternalSourceSettingsFolders,
  resetExternalSourceSettingsFoldersCacheForTest,
  type ExternalSourceSettingsFolder
} from '../../../shared/platform/externalSourceSettingsRepository';

import { useExternalSearchFolders } from './useExternalSearchFolders';

vi.mock('../../../shared/localization/LocalizationProvider', () => {
  const translate = (key: string) => key;
  return { useTranslation: () => translate };
});

afterEach(() => {
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
});

it('shows the current indexing result when opening settings after a background refresh', async () => {
  const folder = createDraftExternalSourceFolder('/library');
  let current: ExternalSourceSettingsFolder[] = [{ ...folder, status: 'error', lastError: 'Indexing failed' }];
  installExternalFolderRuntimeProvider({
    ...getExternalFolderRuntimeProvider(),
    loadFolders: async () => current
  });
  await loadExternalSourceSettingsFolders();
  current = [{ ...folder, status: 'ready', lastError: null, documentCount: 1 }];

  const { result } = renderHook(() => useExternalSearchFolders());

  await waitFor(() => expect(result.current.isLoadingExternalSearchFolders).toBe(false));
  expect(result.current.externalSearchFolders).toMatchObject([
    { status: 'ready', lastError: null, documentCount: 1 }
  ]);
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { selectRuntimeFolder } from '../../../shared/platform/folderSelectionRuntimeRepository';
import {
  EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR,
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting
} from '../../../shared/platform/libraryPathsRuntimeRepository';

import { useLibraryPathSettings } from './useLibraryPathSettings';

vi.mock('../../../shared/platform/folderSelectionRuntimeRepository', () => ({
  selectRuntimeFolder: vi.fn()
}));
vi.mock('../../../shared/platform/libraryPathsRuntimeRepository', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/libraryPathsRuntimeRepository')>(
    '../../../shared/platform/libraryPathsRuntimeRepository'
  );
  return {
    ...actual,
    loadRuntimeLibraryPathSettings: vi.fn(),
    updateRuntimeLibraryPathSetting: vi.fn()
  };
});

const defaultLibraryPaths = {
  assetsDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Assets',
  dataDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Data',
  databasePath: 'C:\\Users\\Tester\\Documents\\Foliole\\Data\\foliole.db',
  inbox: 'C:\\Users\\Tester\\Documents\\Foliole\\Inbox',
  libraryHome: 'C:\\Users\\Tester\\Documents\\Foliole',
  mirror: 'C:\\Users\\Tester\\Documents\\Foliole\\Mirror',
  updatedAt: '2026-03-30T00:00:00.000Z'
};

const mockedSelectRuntimeFolder = vi.mocked(selectRuntimeFolder);
const mockedLoadRuntimeLibraryPathSettings = vi.mocked(loadRuntimeLibraryPathSettings);
const mockedUpdateRuntimeLibraryPathSetting = vi.mocked(updateRuntimeLibraryPathSetting);

beforeEach(() => {
  vi.restoreAllMocks();
  mockedSelectRuntimeFolder.mockResolvedValue('D:\\X\\U\\Foliole');
  mockedLoadRuntimeLibraryPathSettings.mockResolvedValue(defaultLibraryPaths);
  mockedUpdateRuntimeLibraryPathSetting.mockReset();
});

it('confirms before switching to an existing Library Home database', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  mockedUpdateRuntimeLibraryPathSetting
    .mockRejectedValueOnce(new Error(EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR))
    .mockResolvedValueOnce({
      ...defaultLibraryPaths,
      libraryHome: 'D:\\X\\U\\Foliole'
    });

  const { result } = renderHook(() => useLibraryPathSettings());
  await waitFor(() => expect(result.current.isLoadingLibraryPaths).toBe(false));

  await act(async () => {
    await result.current.onChangeLocation('library_home');
  });

  expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Switch to this existing Library Home?'));
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(1, 'library_home', 'D:\\X\\U\\Foliole');
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(2, 'library_home', 'D:\\X\\U\\Foliole', {
    confirmExistingLibraryHome: true
  });
});

it('leaves Library Home unchanged when existing library confirmation is canceled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  mockedUpdateRuntimeLibraryPathSetting.mockRejectedValueOnce(new Error(EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR));

  const { result } = renderHook(() => useLibraryPathSettings());
  await waitFor(() => expect(result.current.isLoadingLibraryPaths).toBe(false));

  await act(async () => {
    await result.current.onChangeLocation('library_home');
  });

  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledTimes(1);
  expect(result.current.libraryHomePath).toBe(defaultLibraryPaths.libraryHome);
  expect(result.current.errorByLocation.library_home).toBeNull();
});

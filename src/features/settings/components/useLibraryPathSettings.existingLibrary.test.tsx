import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { selectRuntimeFolder } from '../../../shared/platform/folderSelectionRuntimeRepository';
import {
  EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR,
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting
} from '../../../shared/platform/libraryPathsRuntimeRepository';
import { AppConfirmationProvider } from '../../../shared/ui';

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

function ConfirmationWrapper({ children }: { children: ReactNode }) {
  return <AppConfirmationProvider>{children}</AppConfirmationProvider>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockedSelectRuntimeFolder.mockResolvedValue('D:\\X\\U\\Foliole');
  mockedLoadRuntimeLibraryPathSettings.mockResolvedValue(defaultLibraryPaths);
  mockedUpdateRuntimeLibraryPathSetting.mockReset();
});

it('confirms before switching to an existing Library Home database', async () => {
  mockedUpdateRuntimeLibraryPathSetting
    .mockRejectedValueOnce(new Error(EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR))
    .mockResolvedValueOnce({
      ...defaultLibraryPaths,
      libraryHome: 'D:\\X\\U\\Foliole'
    });

  const { result } = renderHook(() => useLibraryPathSettings(), { wrapper: ConfirmationWrapper });
  await waitFor(() => expect(result.current.isLoadingLibraryPaths).toBe(false));

  let changePromise: Promise<void> | undefined;
  act(() => {
    changePromise = result.current.onChangeLocation('library_home');
  });
  const dialog = await screen.findByRole('dialog', { name: 'Use existing Library Home?' });
  expect(within(dialog).getByText('Foliole found an existing database in D:\\X\\U\\Foliole.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Use Library Home' }));
  await act(async () => {
    await changePromise;
  });

  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(1, 'library_home', 'D:\\X\\U\\Foliole');
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(2, 'library_home', 'D:\\X\\U\\Foliole', {
    confirmExistingLibraryHome: true
  });
});

it('leaves Library Home unchanged when existing library confirmation is canceled', async () => {
  mockedUpdateRuntimeLibraryPathSetting.mockRejectedValueOnce(new Error(EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR));

  const { result } = renderHook(() => useLibraryPathSettings(), { wrapper: ConfirmationWrapper });
  await waitFor(() => expect(result.current.isLoadingLibraryPaths).toBe(false));

  let changePromise: Promise<void> | undefined;
  act(() => {
    changePromise = result.current.onChangeLocation('library_home');
  });
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Use existing Library Home?' })).getByRole('button', { name: 'Cancel' }));
  await act(async () => {
    await changePromise;
  });

  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledTimes(1);
  expect(result.current.libraryHomePath).toBe(defaultLibraryPaths.libraryHome);
  expect(result.current.errorByLocation.library_home).toBeNull();
});

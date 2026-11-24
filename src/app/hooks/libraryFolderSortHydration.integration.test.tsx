import '../../test/libraryFolderSortHydration.testSupport';

import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import { currentLibraryScope } from '../../../electron/database/attachmentResourceDescription.js';
import { loadJsonSetting } from '../../../electron/database/settingsStore.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { INBOX_NODE_ID } from '../../../lib/core/database/specialNodeIds';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../../lib/platform/folderListSortMemoryContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { hydrateFolderListSortMemory } from '../../shared/platform/desktop/folderListSortMemoryStore';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { FIRST_LIBRARY, invoke, openLibrary, SECOND_LIBRARY, selectSecondLibrary } from '../../test/libraryFolderSortHydration.testSupport';
import { useDocumentPanelFolderListSort } from '../components/useDocumentPanelFolderListSort';

import { useLibrarySettingsHydration } from './useLibrarySettingsHydration';

async function switchToSecondLibrary() {
  await selectSecondLibrary();
  await act(() => refreshWorkspaceState('library-path-change'));
}

function renderInboxSort() {
  return renderHook(() => {
    useLibrarySettingsHydration();
    return useDocumentPanelFolderListSort(INBOX_NODE_ID, 'dateSaved');
  });
}

it('loads the new library in the same window and preserves its other sort choices when editing', async () => {
  const { result } = renderInboxSort();
  await waitFor(() => expect(result.current.key).toBe('name'));

  await switchToSecondLibrary();
  await waitFor(() => expect(result.current.key).toBe('dateImported'));
  act(() => result.current.setKey('name'));
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual({
    ...SECOND_LIBRARY,
    sortByListId: { ...SECOND_LIBRARY.sortByListId, [INBOX_NODE_ID]: { direction: 'desc', key: 'name' } }
  }));

  openLibrary('first');
  expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual(FIRST_LIBRARY);
});

it('rejects a pending sort write for the old library after the native database changes', async () => {
  const { result } = renderInboxSort();
  await waitFor(() => expect(result.current.key).toBe('name'));
  let deliver: (() => Promise<void>) | undefined;
  invoke.mockImplementationOnce((command, args = {}) => new Promise((resolve, reject) => {
    expect(command).toBe(NATIVE_COMMANDS.saveFolderListSortMemory);
    deliver = () => handleStorageCommand(command, args, null).then(resolve, reject);
  }));

  act(() => result.current.setKey('dateImported'));
  await waitFor(() => expect(deliver).toBeDefined());
  await selectSecondLibrary();
  await act(async () => deliver?.());

  expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual(SECOND_LIBRARY);
});

it('ignores a late sort read from the library that was just closed', async () => {
  const { result } = renderInboxSort();
  await waitFor(() => expect(result.current.key).toBe('name'));
  let deliver: (() => void) | undefined;
  invoke.mockImplementationOnce(async (command, args = {}) => {
    expect(command).toBe(NATIVE_COMMANDS.loadFolderListSortMemory);
    const response = await handleStorageCommand(command, args, null);
    return new Promise(resolve => { deliver = () => resolve(response); });
  });

  const oldRead = hydrateFolderListSortMemory({ demo: false, libraryScope: currentLibraryScope() });
  await waitFor(() => expect(deliver).toBeDefined());
  await switchToSecondLibrary();
  await waitFor(() => expect(result.current.key).toBe('dateImported'));
  await act(async () => { deliver?.(); await oldRead; });
  expect(result.current.key).toBe('dateImported');
});

it('saves an edit to the newly selected library while its first sort read is pending', async () => {
  const { result } = renderInboxSort();
  await waitFor(() => expect(result.current.key).toBe('name'));
  let deliver: (() => void) | undefined;
  const dispatch = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (command, args = {}) => {
    const response = await dispatch(command, args);
    if (command !== NATIVE_COMMANDS.loadFolderListSortMemory) return response;
    invoke.mockImplementation(dispatch);
    return new Promise(resolve => { deliver = () => resolve(response); });
  });

  await switchToSecondLibrary();
  await waitFor(() => expect(deliver).toBeDefined());
  expect(result.current.key).toBe('dateSaved');
  act(() => result.current.setKey('name'));
  await act(async () => deliver?.());
  await waitFor(() => expect(result.current.key).toBe('name'));
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual({
    ...SECOND_LIBRARY,
    sortByListId: { ...SECOND_LIBRARY.sortByListId, [INBOX_NODE_ID]: { direction: 'desc', key: 'name' } }
  }));
  openLibrary('first');
  expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual(FIRST_LIBRARY);
});

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { currentLibraryScope } from '../../../electron/database/attachmentResourceDescription.js';
import { closeDatabaseConnection } from '../../../electron/database/connection.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { loadJsonSetting, saveJsonSetting } from '../../../electron/database/settingsStore.js';
import { saveCurrentLibraryHome } from '../../../electron/ipc/libraryPathBootstrap.js';
import { updateLibraryPathSetting } from '../../../electron/ipc/libraryPaths.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID } from '../../../lib/core/database/specialNodeIds';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../../lib/platform/folderListSortMemoryContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { hydrateFolderListSortMemory, resetFolderListSortMemoryForTests } from '../../shared/platform/desktop/folderListSortMemoryStore';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { baseNode, createSectionElement, renderSectionWithProps } from '../components/DocumentPanelSection.testSupport';
import { useDocumentPanelFolderListSort } from '../components/useDocumentPanelFolderListSort';

import { useLibrarySettingsHydration } from './useLibrarySettingsHydration';

const host = vi.hoisted(() => ({ root: '', published: vi.fn() }));
vi.mock('../../shared/platform/foliolePublishRepository', () => ({
  loadFoliolePublishedTopicsFromRuntime: host.published
}));
vi.mock('electron', () => ({}));
vi.mock('../../../electron/nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(host.root, 'cache'),
    app_config_dir: path.join(host.root, 'config'), app_data_dir: host.root,
    app_log_dir: path.join(host.root, 'logs') })
}));
vi.mock('../../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

const FIRST_LIBRARY = { version: 1, sortByListId: { [INBOX_NODE_ID]: { direction: 'asc', key: 'name' } } };
const SECOND_LIBRARY = { version: 1, sortByListId: {
  [INBOX_NODE_ID]: { direction: 'desc', key: 'dateImported' },
  archive: { direction: 'asc', key: 'dateSaved' }
} };
let root: string;
const invoke = vi.fn((command: string, args: Record<string, unknown> = {}) =>
  handleStorageCommand(command, args, null));

function openLibrary(name: string) {
  closeDatabaseConnection();
  saveCurrentLibraryHome(path.join(root, name));
  initializeDatabase();
}

function selectSecondLibrary() {
  return updateLibraryPathSetting({
    confirm_existing_library_home: true, location: 'library_home', path: path.join(root, 'second')
  });
}

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

beforeEach(async () => {
  mkdirSync('.tmp/artifacts/T858-4', { recursive: true });
  root = mkdtempSync(path.resolve('.tmp/artifacts/T858-4/desktop-sort-'));
  host.root = path.join(root, 'app');
  invoke.mockClear();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { invoke } });
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date()));
  openLibrary('second');
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, SECOND_LIBRARY);
  openLibrary('first');
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, FIRST_LIBRARY);
  await useWorkspaceStore.persist.rehydrate();
});

afterEach(() => {
  cleanup();
  resetFolderListSortMemoryForTests();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  closeDatabaseConnection();
  rmSync(root, { recursive: true, force: true });
});

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

const older = '2026-10-01T01:00:00Z';
const newer = '2026-10-02T01:00:00Z';
const topics = {
  alpha: { ...baseNode, id: 'alpha', title: 'Alpha', updatedAt: older, deletedAt: older },
  zulu: { ...baseNode, id: 'zulu', title: 'Zulu', updatedAt: newer, deletedAt: newer }
};

function chooseSort(label: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: /^Sort list by / }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

function topicOrder() {
  return within(screen.getByRole('list', { name: 'Folder contents' })).getAllByRole('button', { name: /^Open / })
    .map(button => button.getAttribute('aria-label'));
}

async function hydrateSorts() {
  await act(() => hydrateFolderListSortMemory({ demo: false, libraryScope: currentLibraryScope() }));
}

async function reopenFirstLibrary() {
  resetFolderListSortMemoryForTests();
  openLibrary('first');
  await hydrateSorts();
}

const rootList = { activeNodeId: null, editableNodeId: null, editorNodeId: null,
  nodeOrder: Object.keys(topics), nodesById: topics };
const trashRoot = { ...rootList, isTrashViewOpen: true, onSelectTrashNode: vi.fn(), trashedNodeIds: rootList.nodeOrder };
const published = { ...rootList, activeVirtualNodeId: VIRTUAL_PUBLISHED_NODE_ID, isFoliolePublishedContext: true };

it.each([
  { name: 'Trash root', listId: TRASH_NODE_ID, section: trashRoot, defaultSort: 'Deleted time' },
  { name: 'Published', listId: VIRTUAL_PUBLISHED_NODE_ID, section: published, defaultSort: 'Date modified' }
])('changes the $name list order and remembers it after navigation and reopening', async ({ listId, section, defaultSort }) => {
  host.published.mockResolvedValue({ status: 'ready', topics: Object.values(topics).map(node => ({
    node_id: node.id, source_state: 'active', title: node.title
  })) });
  await hydrateSorts();
  const view = renderSectionWithProps(section);
  expect(await screen.findByRole('button', { name: `Sort list by ${defaultSort}` })).toBeVisible();
  expect(topicOrder()).toEqual(['Open Zulu', 'Open Alpha']);

  chooseSort('Name');
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
  view.rerender(createSectionElement());
  view.rerender(createSectionElement(section));
  await screen.findByRole('button', { name: 'Sort list by Name' });
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toMatchObject({
    sortByListId: { [listId]: { direction: 'asc', key: 'name' } }
  }));

  view.unmount();
  await reopenFirstLibrary();
  renderSectionWithProps(section);
  await screen.findByRole('button', { name: 'Sort list by Name' });
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
});

it('keeps the daily folder order separate from its Trash order through restore and reopening', async () => {
  const folder = { activeNodeId: 'archive', editableNodeId: null, editorNodeId: 'archive',
    nodeOrder: ['archive', ...rootList.nodeOrder], nodesById: {
      archive: { ...baseNode, id: 'archive', title: 'Archive', kind: 'folder' as const, deletedAt: newer },
      alpha: { ...topics.alpha, parentNodeId: 'archive' },
      zulu: { ...topics.zulu, parentNodeId: 'archive' }
    } };
  const deleted = { ...folder, isTrashViewOpen: true, trashedNodeIds: ['archive'], onSelectTrashNode: vi.fn() };
  await hydrateSorts();
  const view = renderSectionWithProps(folder);
  chooseSort('Name');
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);

  view.rerender(createSectionElement(deleted));
  chooseSort('Deleted time');
  expect(topicOrder()).toEqual(['Open Zulu', 'Open Alpha']);
  chooseSort('Oldest first');
  view.rerender(createSectionElement(folder));
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toMatchObject({ sortByListId: {
    archive: { direction: 'asc', key: 'name' }, 'trash:archive': { direction: 'asc', key: 'dateDeleted' }
  } }));

  view.unmount();
  await reopenFirstLibrary();
  const reopened = renderSectionWithProps(folder);
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();
  reopened.rerender(createSectionElement(deleted));
  expect(screen.getByRole('button', { name: 'Sort list by Deleted time' })).toBeInTheDocument();
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
});

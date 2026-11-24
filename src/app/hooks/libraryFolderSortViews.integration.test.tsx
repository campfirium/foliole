import '../../test/libraryFolderSortHydration.testSupport';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { currentLibraryScope } from '../../../electron/database/attachmentResourceDescription.js';
import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../../../electron/database/nodeTrashTransitions.js';
import { loadJsonSetting, saveJsonSetting } from '../../../electron/database/settingsStore.js';
import { TRASH_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID } from '../../../lib/core/database/specialNodeIds';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../../lib/platform/folderListSortMemoryContract';
import { hydrateFolderListSortMemory, resetFolderListSortMemoryForTests } from '../../shared/platform/desktop/folderListSortMemoryStore';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { mockPublishedTopics, openLibrary } from '../../test/libraryFolderSortHydration.testSupport';
import { baseNode, createSectionElement, renderSectionWithProps } from '../components/DocumentPanelSection.testSupport';

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
  await act(() => refreshWorkspaceState());
}

const rootList = { activeNodeId: null, editableNodeId: null, editorNodeId: null,
  nodeOrder: Object.keys(topics), nodesById: topics };
const trashRoot = { ...rootList, isTrashViewOpen: true, onSelectTrashNode: vi.fn(), trashedNodeIds: rootList.nodeOrder };
const published = { ...rootList, activeVirtualNodeId: VIRTUAL_PUBLISHED_NODE_ID, isFoliolePublishedContext: true };

it.each([
  { name: 'Trash root', listId: TRASH_NODE_ID, section: trashRoot, defaultSort: 'Deleted time' },
  { name: 'Published', listId: VIRTUAL_PUBLISHED_NODE_ID, section: published, defaultSort: 'Date modified' }
])('changes the $name list order and remembers it after navigation and reopening', async ({ listId, section, defaultSort }) => {
  mockPublishedTopics.mockResolvedValue({ status: 'ready', topics: Object.values(topics).map(node => ({
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

function seedArchive() {
  const driver = openDatabaseConnection().driver;
  const insert = driver.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', ?, ?)`);
  insert.run(['archive', null, 'Archive', 'folder', older, newer]);
  for (const node of Object.values(topics)) {
    insert.run([node.id, 'archive', node.title, 'topic', older, node.updatedAt]);
  }
  return act(() => refreshWorkspaceState());
}

async function moveArchiveToTrash() {
  softDeleteNodesWithParents({ nodeIds: ['alpha'], deletedAt: older });
  softDeleteNodesWithParents({ nodeIds: ['archive', 'zulu'], deletedAt: newer });
  await act(() => refreshWorkspaceState());
}

function archiveSection(isTrashViewOpen = false) {
  const { nodeOrder, nodesById, trashedNodeIds } = useWorkspaceStore.getState();
  return { activeNodeId: 'archive', editableNodeId: null, editorNodeId: 'archive', isTrashViewOpen,
    nodeOrder, nodesById, onSelectTrashNode: vi.fn(), trashedNodeIds };
}

it('keeps the daily folder order separate from its Trash order through restore and reopening', async () => {
  await seedArchive();
  await hydrateSorts();
  const view = renderSectionWithProps(archiveSection());
  chooseSort('Name');
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);

  await moveArchiveToTrash();
  view.rerender(createSectionElement(archiveSection(true)));
  chooseSort('Deleted time');
  expect(topicOrder()).toEqual(['Open Zulu', 'Open Alpha']);
  chooseSort('Oldest first');
  const restored = restoreNodesWithParents({ nodeIds: ['archive', 'alpha', 'zulu'] });
  expect(restored.restoredNodeIds).toEqual(expect.arrayContaining(['archive', 'alpha', 'zulu']));
  await act(() => refreshWorkspaceState());
  view.rerender(createSectionElement(archiveSection()));
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toMatchObject({ sortByListId: {
    archive: { direction: 'asc', key: 'name' }, 'trash:archive': { direction: 'asc', key: 'dateDeleted' }
  } }));

  view.unmount();
  await reopenFirstLibrary();
  const reopened = renderSectionWithProps(archiveSection());
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();
  await moveArchiveToTrash();
  reopened.rerender(createSectionElement(archiveSection(true)));
  expect(screen.getByRole('button', { name: 'Sort list by Deleted time' })).toBeInTheDocument();
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
});

it('applies a direction change to the visible sort when a restored folder has an older Trash sort', async () => {
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, { version: 1,
    sortByListId: { archive: { direction: 'asc', key: 'dateDeleted' } } });
  await seedArchive();
  await hydrateSorts();
  renderSectionWithProps(archiveSection());
  expect(topicOrder()).toEqual(['Open Zulu', 'Open Alpha']);
  chooseSort('Oldest first');
  expect(topicOrder()).toEqual(['Open Alpha', 'Open Zulu']);
  await waitFor(() => expect(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toMatchObject({ sortByListId: {
    archive: { direction: 'asc', key: 'dateSaved' }
  } }));
});

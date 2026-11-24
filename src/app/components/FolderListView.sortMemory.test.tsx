import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  parseFolderListSortMemoryPayload, withFolderListSortChoice, type FolderListSortMemoryEdit
} from '../../../lib/platform/folderListSortMemoryContract';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import {
  hydrateFolderListSortMemory,
  resetFolderListSortMemoryForTests
} from '../../shared/platform/desktop/folderListSortMemoryStore';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { FolderListView } from './FolderListView';
import { useDocumentPanelFolderListSort } from './useDocumentPanelFolderListSort';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

let saved: unknown = null;
const libraryScope = 'library';
const invoke = vi.fn(async (command: string, edit?: FolderListSortMemoryEdit) => {
  if (command === NATIVE_COMMANDS.saveFolderListSortMemory && edit) {
    saved = withFolderListSortChoice(parseFolderListSortMemoryPayload(saved), edit.listId, edit.choice, edit.fallback);
    return saved;
  }
  if (command === NATIVE_COMMANDS.loadFolderListSortMemory) return saved;
  throw new Error(`unexpected command ${command}`);
});

function node(id: string, title: string, parentNodeId: string | null, updatedAt: string, extra: Partial<Node> = {}): Node {
  return {
    content: '', createdAt: updatedAt, id, kind: parentNodeId ? 'topic' : 'folder', parentNodeId,
    reveal: null, review: null, title, updatedAt, ...extra
  };
}

const nodesById: Record<string, Node> = {
  inbox: node('inbox', 'Inbox', null, '2026-04-01T00:00:00.000Z'),
  archive: node('archive', 'Archive', null, '2026-04-01T00:00:00.000Z'),
  ordered: node('ordered', 'Ordered', null, '2026-04-01T00:00:00.000Z', { manualChildOrder: ['o-b', 'o-a'] }),
  'i-a': node('i-a', 'Alpha inbox', 'inbox', '2026-04-02T00:00:00.000Z'),
  'i-b': node('i-b', 'Beta inbox', 'inbox', '2026-04-03T00:00:00.000Z'),
  'a-a': node('a-a', 'Alpha archive', 'archive', '2026-04-02T00:00:00.000Z'),
  'a-b': node('a-b', 'Beta archive', 'archive', '2026-04-03T00:00:00.000Z'),
  'o-a': node('o-a', 'Alpha ordered', 'ordered', '2026-04-03T00:00:00.000Z'),
  'o-b': node('o-b', 'Beta ordered', 'ordered', '2026-04-02T00:00:00.000Z')
};
const nodeOrder = Object.keys(nodesById);

function MainPanelFolders() {
  const [folderId, setFolderId] = useState('inbox');
  const sort = useDocumentPanelFolderListSort(folderId, nodesById[folderId]?.manualChildOrder?.length ? 'manual' : 'dateSaved');
  return (
    <>
      {['inbox', 'archive', 'ordered'].map((id) => (
        <button key={id} onClick={() => setFolderId(id)} type="button">{`Go ${id}`}</button>
      ))}
      <FolderListView
        folderNodeId={folderId}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onChangeSortDirection={sort.setDirection}
        onChangeSortKey={sort.setKey}
        onSelectNode={vi.fn()}
        sortDirection={sort.direction}
        sortKey={sort.key}
      />
    </>
  );
}

function titles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

function chooseSort(current: string, next: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Sort list by ${current}` }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: next }));
}

async function reopen() {
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.saveFolderListSortMemory, expect.anything()));
  resetFolderListSortMemoryForTests();
  await act(() => hydrateFolderListSortMemory({ demo: false, libraryScope }));
}

beforeEach(async () => {
  saved = null;
  invoke.mockClear();
  resetFolderListSortMemoryForTests();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke as never);
  await hydrateFolderListSortMemory({ demo: false, libraryScope });
});

afterEach(() => resetFolderListSortMemoryForTests());

it('keeps each folder on its own sort and restores it after the library reopens', async () => {
  const view = renderWithLocalization(<MainPanelFolders />);
  expect(titles()).toEqual(['Beta inbox', 'Alpha inbox']);

  chooseSort('Date modified', 'Name');
  expect(titles()).toEqual(['Alpha inbox', 'Beta inbox']);

  fireEvent.click(screen.getByRole('button', { name: 'Go archive' }));
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(titles()).toEqual(['Beta archive', 'Alpha archive']);

  fireEvent.click(screen.getByRole('button', { name: 'Go inbox' }));
  expect(titles()).toEqual(['Alpha inbox', 'Beta inbox']);

  view.unmount();
  await reopen();
  expect(saved).toEqual({ sortByListId: { inbox: { direction: 'asc', key: 'name' } }, version: 1 });
  renderWithLocalization(<MainPanelFolders />);
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();
  expect(titles()).toEqual(['Alpha inbox', 'Beta inbox']);
});

it('opens a custom-ordered folder in its order and forgets the choice when that order is picked again', async () => {
  renderWithLocalization(<MainPanelFolders />);
  fireEvent.click(screen.getByRole('button', { name: 'Go ordered' }));
  expect(titles()).toEqual(['Beta ordered', 'Alpha ordered']);

  chooseSort('Manual', 'Name');
  expect(titles()).toEqual(['Alpha ordered', 'Beta ordered']);
  fireEvent.click(screen.getByRole('button', { name: 'Go inbox' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go ordered' }));
  expect(screen.getByRole('button', { name: 'Sort list by Name' })).toBeInTheDocument();

  chooseSort('Name', 'Manual');
  expect(titles()).toEqual(['Beta ordered', 'Alpha ordered']);
  await waitFor(() => expect(saved).toEqual({ sortByListId: {}, version: 1 }));
});

it('remembers a list the caller does not control when it carries a list id', async () => {
  const list = (
    <FolderListView
      folderNodeId="archive"
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onSelectNode={vi.fn()}
      sortMemoryId="dive-1"
    />
  );
  const view = renderWithLocalization(list);
  chooseSort('Date modified', 'Oldest first');
  expect(titles()).toEqual(['Alpha archive', 'Beta archive']);
  view.unmount();

  await reopen();
  expect(saved).toEqual({ sortByListId: { 'dive-1': { direction: 'asc', key: 'dateSaved' } }, version: 1 });
  renderWithLocalization(list);
  expect(titles()).toEqual(['Alpha archive', 'Beta archive']);
});

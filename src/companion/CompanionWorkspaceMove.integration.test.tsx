// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { buildMoveDestinationTree, visibleMoveDestinations } from './companionMoveDestinationTree';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceHistoryActions, useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let initial: WorkspaceSnapshot;
const stored = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const now = '2026-11-17T00:00:00Z';
  const nodes = [
    { id: 'learning', title: 'Learning', kind: 'folder', parentNodeId: null },
    { id: 'memory', title: 'Memory', kind: 'folder', parentNodeId: 'learning' },
    { id: 'retrieval', title: 'Retrieval', kind: 'topic', parentNodeId: 'memory' },
    { id: 'work', title: 'Work', kind: 'folder', parentNodeId: null },
    { id: 'work-retrieval', title: 'Retrieval', kind: 'topic', parentNodeId: 'work' },
    { id: 'source', title: 'Source', kind: 'topic', parentNodeId: 'work' },
    { id: 'source-child', title: 'Source child', kind: 'topic', parentNodeId: 'source' },
    { id: 'item', title: 'Question', kind: 'item', parentNodeId: 'retrieval' },
    { id: 'removed', title: 'Removed', kind: 'folder', parentNodeId: null, deletedAt: now }
  ] as const;
  await applyCompanionLocalNodeVersions(await Promise.all(nodes.map(node => toWorkspaceNativeNodeVersion({
    ...node, content: 'Body', reveal: node.kind === 'item' ? 'Answer' : null, createdAt: now, updatedAt: now,
    isTitleManual: true, hideTitleHeading: false, anchorLink: null, review: null, reading: null
  }, 'Search', `initial-${node.id}`))));
  initial = await stored();
});
afterEach(async () => { cleanup(); await library.close(); });

function OpenMove({ sourceId }: { sourceId: string }) {
  const actions = useCompanionWorkspaceActions()!;
  return <button onClick={() => actions.open({ mode: 'menu', nodeId: sourceId, parentNodeId: null })}>Manage source</button>;
}
function Harness({ sourceId = 'source' }: { sourceId?: string }) {
  const [snapshot, setSnapshot] = useState(initial);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionWorkspaceActionsProvider snapshot={snapshot}
    refresh={async () => { const next = await stored(); setSnapshot(next); return next; }} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}}>
    <OpenMove sourceId={sourceId} /><CompanionWorkspaceHistoryActions />
  </CompanionWorkspaceActionsProvider></LocalizationProvider>;
}
function openMove() {
  fireEvent.click(screen.getByRole('button', { name: 'Manage source' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to...' }));
  return screen.getByRole('searchbox', { name: 'Search destinations' });
}
function choose(path: string) { fireEvent.click(screen.getByRole('button', { name: path })); }
function confirm() {
  const input = screen.getByRole('searchbox', { name: 'Search destinations' });
  fireEvent.click(within(input.closest('form')!).getByRole('button', { name: 'Done' }));
}

it.each([
  { action: 'Rename', message: 'Could not rename this entry.' },
  { action: 'Move to...', message: 'Could not move this entry.' },
  { action: 'Move to Trash', message: 'Could not move this entry to Trash.' }
])('identifies a rejected SQLite write for $action', async ({ action, message }) => {
  render(<Harness />);
  library.database.exec(`CREATE TRIGGER reject_metadata BEFORE UPDATE ON nodes
    WHEN NEW.id = 'source' BEGIN SELECT RAISE(ABORT, 'metadata rejected'); END`);
  fireEvent.click(screen.getByRole('button', { name: 'Manage source' }));
  fireEvent.click(screen.getByRole('button', { name: action }));
  if (action === 'Rename') fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Changed' } });
  if (action === 'Move to...') fireEvent.click(screen.getByRole('button', { name: 'Learning', pressed: false }));
  fireEvent.click(within(screen.getByRole('dialog').querySelector('form')!).getByRole('button', {
    name: action === 'Move to Trash' ? action : 'Done'
  }));
  expect(await screen.findByRole('status')).toHaveTextContent(message);
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  expect((await stored()).nodesById.source).toEqual(initial.nodesById.source);
});

it('identifies rejected Undo and Redo writes as history failures', async () => {
  render(<Harness />);
  openMove();
  fireEvent.click(screen.getByRole('button', { name: 'Learning', pressed: false }));
  confirm();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  for (const [action, currentParent] of [['Undo', 'learning'], ['Redo', 'work']] as const) {
    library.database.exec(`CREATE TRIGGER reject_history BEFORE UPDATE ON nodes
      WHEN NEW.id = 'source' BEGIN SELECT RAISE(ABORT, 'history rejected'); END`);
    const button = await screen.findByRole('button', { name: `${action} Move` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not undo or redo.');
    expect((await stored()).nodesById.source?.parentNodeId).toBe(currentParent);
    library.database.exec('DROP TRIGGER reject_history');
    fireEvent.click(button);
    await waitFor(async () => expect((await stored()).nodesById.source?.parentNodeId)
      .toBe(action === 'Undo' ? 'work' : 'learning'));
    expect(screen.queryByRole('status')).toBeNull();
  }
});

it('browses collapsed branches without searching, confirms a move, hydrates it and supports undo', async () => {
  render(<Harness />);
  openMove();
  expect(screen.queryByRole('button', { name: 'Learning / Memory / Retrieval' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Learning', expanded: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Memory', expanded: false }));
  choose('Learning / Memory / Retrieval');
  expect((await stored()).nodesById.source?.parentNodeId).toBe('work');
  confirm();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await stored()).nodesById.source?.parentNodeId).toBe('retrieval');
  await reopenSearchLibrary(library.root, '2026-11-17T01:00:00Z');
  expect((await stored()).nodesById.source?.parentNodeId).toBe('retrieval');
  fireEvent.click(await screen.findByRole('button', { name: 'Undo Move' }));
  await waitFor(async () => expect((await stored()).nodesById.source?.parentNodeId).toBe('work'));
});

it('searches collapsed branches and paths, preserves expansion on clear and never submits on Enter', async () => {
  render(<Harness />);
  const input = openMove();
  fireEvent.click(screen.getByRole('button', { name: 'Learning', expanded: false }));
  fireEvent.change(input, { target: { value: 'retrieval' } });
  expect(screen.getByRole('button', { name: 'Learning / Memory / Retrieval' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Work / Retrieval' })).toBeVisible();
  choose('Learning / Memory / Retrieval');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect((await stored()).nodesById.source?.parentNodeId).toBe('work');
  fireEvent.change(input, { target: { value: 'Learning / Memory' } });
  expect(screen.queryByRole('button', { name: 'Work / Retrieval' })).toBeNull();
  fireEvent.change(input, { target: { value: 'no-matching-destination' } });
  expect(screen.getByRole('status')).toHaveTextContent('No matching destinations');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Learning', expanded: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Learning / Memory' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Learning / Memory / Retrieval' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await stored()).nodesById.source?.parentNodeId).toBe('work');
});

it('excludes the source subtree, items and deleted parents and only offers root for folders', async () => {
  const view = render(<Harness />);
  const input = openMove();
  expect(screen.queryByRole('button', { name: 'Root directory' })).toBeNull();
  for (const query of ['Source', 'Question', 'Removed']) {
    fireEvent.change(input, { target: { value: query } });
    expect(screen.getByRole('status')).toHaveTextContent('No matching destinations');
  }
  view.unmount();
  render(<Harness sourceId="memory" />);
  const folderSearch = openMove();
  fireEvent.change(folderSearch, { target: { value: 'Root directory' } });
  expect(screen.queryByRole('status')).toBeNull();
  choose('Root directory');
  confirm();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await stored()).nodesById.memory?.parentNodeId).toBeNull();
});

it('keeps a large library collapsed while searching destinations outside the visible branches', () => {
  const nodes = { ...initial.nodesById };
  for (let index = 0; index < 2000; index++) {
    const id = `large-${index}`;
    nodes[id] = { ...nodes.retrieval!, id, title: `Destination ${index}` };
  }
  const tree = buildMoveDestinationTree(nodes.source!, nodes, node => node.title);
  expect(visibleMoveDestinations(tree, new Set(), '').some(row => row.title === 'Destination 1999')).toBe(false);
  expect(visibleMoveDestinations(tree, new Set(), 'Destination 1999').map(row => row.id)).toEqual(['large-1999']);
  expect(visibleMoveDestinations(tree, new Set(['learning', 'memory']), '').some(row => row.id === 'large-1999')).toBe(true);
});

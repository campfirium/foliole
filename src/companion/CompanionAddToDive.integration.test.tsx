// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { addDiveSources, createDive, listDives } from '../../electron/database/diveRepository';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { addCompanionDiveSource } from '../shared/platform/companion/runtime/companionDiveSources';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { RecentArticleRow } from './CompanionRecentArticleList';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceCreateAction } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
const addLabel = 'Add to Dive…';

function Directory({ initial }: { initial: WorkspaceSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'root' });
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    {selection.kind === 'root' && <>
      <CompanionWorkspaceCreateAction />
      <RecentArticleRow article={{ nodeId: 'Root Topic', title: 'Root Topic', preview: null, updatedAt: '', folderLabel: null }}
        currentArticleId={null} onSelectArticle={() => {}} />
    </>}
    <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection}
      onSelectNode={() => {}} snapshot={snapshot} sortDirection="asc" sortKey="name" />
  </CompanionWorkspaceActionsProvider>;
}

it('adds a folder and root Topic from Browse, updates the open workspace, syncs to desktop and survives mobile reopen', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    const dive = createDive(peers.desktop.db, 'Probability', []);
    createDive(peers.desktop.db, 'Other', []);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Root Topic', 'topic');
    node(peers.desktop, 'Desktop Topic', 'topic');
    await peers.exchange();
    node(peers.desktop, 'Folder Topic', 'topic', 'Shelf');
    node(peers.desktop, 'Nested Topic', 'topic', 'Root Topic');
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    await addFromMenu('Shelf');
    openRow('More: Shelf');
    openRow(addLabel);
    const picker = screen.getByRole('dialog', { name: 'Add to Dive' });
    expect(within(picker).queryByRole('button', { name: 'Probability' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Done' }));
    await expect(addCompanionDiveSource(dive.id, 'Nested Topic')).rejects.toThrow('source is unavailable');
    await addFromMenu('Root Topic');
    openRow('Open folder Probability');
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open folder Shelf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open topic Folder Topic' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Open topic Root Topic' })).toHaveLength(2);

    addDiveSources(peers.desktop.db, dive.id, ['Desktop Topic']);
    await peers.exchange();
    const expectedSources = ['Desktop Topic', 'Root Topic', 'Shelf'];
    expect([...listDives(peers.desktop.db).find(value => value.id === dive.id)!.directSourceIds].sort()).toEqual(expectedSources);

    cleanup();
    const reopened = await reopenSearchLibrary(library.root, new Date().toISOString());
    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    openRow('Open folder Probability');
    expect(screen.getByRole('button', { name: 'Open folder Shelf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open topic Folder Topic' })).toBeVisible();
    const order = reopened.db.prepare('SELECT manual_child_order FROM nodes WHERE id = ?').pluck().get(dive.id) as string;
    expect(JSON.parse(order).sort()).toEqual(expectedSources);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

async function addFromMenu(title: string) {
  openRow(new RegExp(`: ${title}$`));
  openRow(addLabel);
  const picker = screen.getByRole('dialog', { name: 'Add to Dive' });
  fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'prob' } });
  expect(within(picker).queryByRole('button', { name: 'Other' })).toBeNull();
  fireEvent.click(within(picker).getByRole('button', { name: 'Probability' }));
  await waitFor(() => expect(picker).not.toBeInTheDocument());
}

it('removes a directly added Topic from its Dive and preserves the library Topic on both peers', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    const dive = createDive(peers.desktop.db, 'Probability', []);
    createDive(peers.desktop.db, 'Other', []);
    node(peers.desktop, 'Root Topic', 'topic');
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    await addFromMenu('Root Topic');
    openRow('Open folder Probability');
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'More: Root Topic' })[0]!);
    openRow('Remove from This Dive');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sources' })).toBeNull());
    const preservedTopic = (await readSnapshot()).nodesById['Root Topic'];
    expect(preservedTopic?.title).toBe('Root Topic');
    expect(preservedTopic?.deletedAt).toBeFalsy();
    await peers.exchange();
    expect(listDives(peers.desktop.db).find(value => value.id === dive.id)?.directSourceIds).toEqual([]);
    expect(peers.desktop.db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('Root Topic')).toEqual({ deleted_at: null });
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

function openRow(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

it('creates a Dive on mobile with a source found by its folder path and syncs it to desktop', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Leaf', 'topic', 'Shelf');
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    openRow('Create Dive');
    const sheet = screen.getByRole('dialog', { name: 'Create Dive' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), { target: { value: 'Mobile Dive' } });
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'Shelf / Leaf' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Shelf / Leaf' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create Dive' }));
    await screen.findByRole('button', { name: 'Open folder Mobile Dive' });
    openRow('Open folder Mobile Dive');
    expect(screen.getAllByRole('button', { name: 'Open topic Leaf' }).length).toBeGreaterThan(0);
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toContainEqual(expect.objectContaining({ title: 'Mobile Dive', directSourceIds: ['Leaf'] }));
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('moves a Dive to Trash and restores it across sync with its source intact', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Root Topic', 'topic');
    const dive = createDive(peers.desktop.db, 'Probability', ['Root Topic']);
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    openRow('More: Probability');
    openRow('Move to Trash');
    openRow('Move to Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Probability' })).toBeNull());
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toEqual([]);
    expect(peers.desktop.db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('Root Topic')).toEqual({ deleted_at: null });

    openRow('Open folder Trash');
    openRow('More: Probability');
    openRow('Restore from Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Probability' })).toBeNull());
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toEqual([dive]);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { addDiveSources, createDive, listDives } from '../../electron/database/diveRepository';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionVirtualFolderResultIds } from '../shared/platform/companion/runtime/companionVirtualFolderResults';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceCreateChoices, CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

function Directory({ initial }: { initial: WorkspaceSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'root' });
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    <CompanionWorkspaceCreateChoices onSelect={() => {}} />
    <CompanionWorkspaceHistoryActions />
    <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection}
      onSelectNode={() => {}} snapshot={snapshot} sortDirection="asc" sortKey="name" />
  </CompanionWorkspaceActionsProvider>;
}

it('creates a manual index directly from mobile, supports undo and syncs the same index to desktop', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    await peers.exchange();
    renderWithLocalization(<Directory initial={await readSnapshot()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Virtual', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'Create in Virtual' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Name' }), { target: { value: 'Mobile Index' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create in Virtual' }));
    await screen.findByRole('button', { name: 'Open folder Mobile Index' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Mobile Index' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await screen.findByRole('button', { name: 'Open folder Mobile Index' });

    const snapshot = await readSnapshot();
    const index = Object.values(snapshot.nodesById).find(entry => entry.title === 'Mobile Index');
    expect(index?.parentNodeId).toBe(VIRTUAL_ROOT_NODE_ID);
    expect(isManualVirtualNodeFilter(index?.virtualFilter)).toBe(true);
    await peers.exchange();
    const desktopIndex = peers.desktop.db.prepare('SELECT parent_id, virtual_filter FROM nodes WHERE id = ?')
      .get(index!.id) as { parent_id: string; virtual_filter: string };
    expect(desktopIndex.parent_id).toBe(VIRTUAL_ROOT_NODE_ID);
    expect(isManualVirtualNodeFilter(JSON.parse(desktopIndex.virtual_filter))).toBe(true);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('converts an existing Dive to a manual virtual directory and back from the mobile directory menu', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Primer', 'topic', 'Shelf');
    const dive = createDive(peers.desktop.db, 'Probability', []);
    const saved = addDiveSources(peers.desktop.db, dive.id, ['Shelf']);
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    expect(screen.getByRole('heading', { name: /^Dive$/ })).toBeVisible();
    await convert('Probability', 'Convert to Virtual');
    expect(screen.queryByRole('heading', { name: /^Dive$/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Open folder Probability' })).toHaveLength(1);
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toEqual([]);
    expect(peers.desktop.db.prepare('SELECT title, parent_id, manual_child_order FROM nodes WHERE id=?').get(dive.id))
      .toEqual({ title: 'Probability', parent_id: VIRTUAL_ROOT_NODE_ID, manual_child_order: '["Shelf"]' });

    const indexSnapshot = await readSnapshot();
    expect(isManualVirtualNodeFilter(indexSnapshot.nodesById[dive.id]?.virtualFilter)).toBe(true);
    expect(await loadCompanionVirtualFolderResultIds(indexSnapshot, dive.id)).toEqual(['Primer']);
    await convert('Probability', 'Convert to Dive');
    expect(screen.getByRole('heading', { name: /^Dive$/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder Probability' }));
    expect(screen.getByRole('button', { name: 'Open folder Shelf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open topic Primer' })).toBeVisible();

    await peers.exchange();
    expect(listDives(peers.desktop.db)).toEqual([saved]);
    cleanup();
    await reopenSearchLibrary(library.root, new Date().toISOString());
    const reopened = await readSnapshot();
    expect(reopened.nodesById[dive.id]).toMatchObject({ parentNodeId: null, manualChildOrder: saved.directSourceIds });
    renderWithLocalization(<Directory initial={reopened} />);
    expect(screen.getAllByRole('button', { name: 'Open folder Probability' })).toHaveLength(1);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('converts current full-body matches into fixed eligible sources on mobile', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Standalone', 'topic');
    await peers.exchange();
    node(peers.desktop, 'Nested', 'topic', 'Standalone');
    node(peers.desktop, 'Card', 'item', 'Standalone');
    const stamp = new Date().toISOString();
    upsertNodeSnapshot(peers.desktop.driver, {
      nodeId: 'filtered', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, title: 'Matches',
      virtualFilter: { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'body' }] },
      content: '', reveal: null, anchorLink: null, position: null, isTitleManual: true,
      createdAt: stamp, updatedAt: stamp, hostName: peers.desktop.name
    });
    flushNodeSyncVersionWithDriver(peers.desktop.driver, 'filtered', peers.desktop.name, stamp);
    await peers.exchange();

    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    await convert('Matches', 'Convert to Dive', /Future matches won’t be added automatically/);
    expect(screen.getAllByRole('button', { name: 'Open folder Matches' })).toHaveLength(1);
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toEqual([{ id: 'filtered', title: 'Matches', directSourceIds: ['Standalone'] }]);

    node(peers.desktop, 'Later Match', 'topic');
    await peers.exchange();
    cleanup();
    await reopenSearchLibrary(library.root, new Date().toISOString());
    renderWithLocalization(<Directory initial={await readSnapshot()} />);
    await convert('Matches', 'Convert to Virtual');
    const reopened = (await readSnapshot()).nodesById.filtered;
    expect(isManualVirtualNodeFilter(reopened?.virtualFilter)).toBe(true);
    expect(reopened?.manualChildOrder).toEqual(['Standalone']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

async function convert(title: string, action: string, explanation?: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: 'More: ' + title }));
  fireEvent.click(screen.getByRole('button', { name: action }));
  const confirmation = screen.getByRole('dialog', { name: title });
  if (explanation) expect(within(confirmation).getByText(explanation)).toBeVisible();
  fireEvent.click(within(confirmation).getByRole('button', { name: action }));
  await waitFor(() => expect(confirmation).not.toBeInTheDocument());
}

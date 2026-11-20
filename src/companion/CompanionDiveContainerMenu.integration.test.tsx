// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { createDive, listDives } from '../../electron/database/diveRepository';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { CompanionWorkspaceActionsProvider } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

function DivePage({ initial, diveId }: { initial: WorkspaceSnapshot; diveId: string }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'virtual', nodeId: diveId });
  const dive = snapshot.nodesById[diveId]!;
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    <h1>{dive.title}</h1>
    <CompanionBrowseTopActions page={{ kind: 'dive', nodeId: diveId }}
      diveActions={{ dive: { id: diveId, title: dive.title, directSourceIds: dive.manualChildOrder ?? [] } }}
      onChangeSortDirection={() => {}} onChangeSortKey={() => {}} onOpenCapture={() => {}} sortDirection="asc" sortKey="name" />
    <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection}
      onSelectNode={() => {}} snapshot={snapshot} sortDirection="asc" sortKey="name" />
  </CompanionWorkspaceActionsProvider>;
}

it('adds a source and renames the Dive from its own menu, then syncs both to desktop', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Leaf', 'topic');
    const dive = createDive(peers.desktop.db, 'Probability', ['Leaf']);
    await peers.exchange();

    renderWithLocalization(<DivePage initial={await readSnapshot()} diveId={dive.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Source…' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Add Source' }));
    fireEvent.change(sheet.getByRole('searchbox'), { target: { value: 'Shelf' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Shelf' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Add Source' }));
    await screen.findByRole('button', { name: 'Open folder Shelf' });

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Odds' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Odds' })).toBeVisible());

    await peers.exchange();
    expect(listDives(peers.desktop.db)).toContainEqual(expect.objectContaining({
      id: dive.id, title: 'Odds', directSourceIds: expect.arrayContaining(['Leaf', 'Shelf'])
    }));
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('says there is nothing to add when every eligible source is already in the Dive', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Only', 'topic');
    const dive = createDive(peers.desktop.db, 'Probability', ['Only']);
    await peers.exchange();
    renderWithLocalization(<DivePage initial={await readSnapshot()} diveId={dive.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Source…' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Add Source' }));
    expect(sheet.getByRole('status')).toHaveTextContent('Every eligible folder and topic is already in this Dive.');
    expect(sheet.queryByRole('button', { name: 'Add Source' })).toBeNull();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

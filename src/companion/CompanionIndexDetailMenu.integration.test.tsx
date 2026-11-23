// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveBrowsePage } from './CompanionTopBarPropsModel';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceCreateChoices } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

function Page({ initial }: { initial: WorkspaceSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'root' });
  const title = selection.kind === 'virtual' ? snapshot.nodesById[selection.nodeId]?.title ?? '' : 'Directory';
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    <h1>{title}</h1>
    <CompanionWorkspaceCreateChoices onSelect={() => {}} />
    <CompanionBrowseTopActions page={resolveBrowsePage(true, selection, undefined)} menuTitle={title}
      onChangeSortDirection={() => {}} onChangeSortKey={() => {}} onOpenCapture={() => {}} sortDirection="asc" sortKey="name" />
    <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection}
      onSelectNode={() => {}} snapshot={snapshot} sortDirection="asc" sortKey="name" />
  </CompanionWorkspaceActionsProvider>;
}

const openMore = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

it('manages a manual index from its own detail menu and refreshes the open page', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Leaf', 'topic');
    await peers.exchange();
    renderWithLocalization(<Page initial={await readSnapshot()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create in Virtual' }));
    const create = screen.getByRole('dialog', { name: 'Create in Virtual' });
    fireEvent.change(within(create).getByRole('textbox', { name: 'Name' }), { target: { value: 'Mobile Index' } });
    fireEvent.click(within(create).getByRole('button', { name: 'Create in Virtual' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder Mobile Index' }));
    await screen.findByRole('heading', { name: 'Mobile Index' });
    const indexId = Object.values((await readSnapshot()).nodesById).find(entry => entry.title === 'Mobile Index')!.id;

    openMore();
    expect(screen.queryByRole('button', { name: 'Remove source…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add source…' }));
    const add = within(screen.getByRole('dialog', { name: 'Add source…' }));
    fireEvent.click(add.getByRole('button', { name: 'Leaf' }));
    fireEvent.click(add.getByRole('button', { name: 'Add source' }));
    await screen.findByRole('button', { name: 'Open topic Leaf' });

    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Remove source…' }));
    const remove = within(screen.getByRole('dialog', { name: 'Remove source…' }));
    fireEvent.click(remove.getByRole('button', { name: 'Leaf' }));
    fireEvent.click(remove.getByRole('button', { name: 'Remove source' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Leaf' })).toBeNull());

    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = within(screen.getByRole('dialog', { name: 'Mobile Index' })).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Renamed Index' } });
    fireEvent.click(within(name.closest('form')!).getByRole('button', { name: 'Done' }));
    await screen.findByRole('heading', { name: 'Renamed Index' });

    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Renamed Index' })).getByRole('button', { name: 'Move to Trash' }));
    await waitFor(async () => expect((await readSnapshot()).trashedNodeIds).toContain(indexId));
    openMore();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();

    await peers.exchange();
    expect(peers.desktop.db.prepare('SELECT title, deleted_at FROM nodes WHERE id = ?').get(indexId))
      .toEqual({ title: 'Renamed Index', deleted_at: expect.any(String) });
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

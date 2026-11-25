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

import { CompanionTopicListMenu } from './CompanionTopicListMenu';
import { CompanionWorkspaceActionsProvider } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

function FolderMenu({ initial, nodeId }: { initial: WorkspaceSnapshot; nodeId: string }) {
  const [snapshot, setSnapshot] = useState(initial);
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    <CompanionTopicListMenu nodeId={nodeId} title={snapshot.nodesById[nodeId]!.title} />
  </CompanionWorkspaceActionsProvider>;
}

it('turns on Sequential Reading and overrides then restores a folder branch review option from its menu, then syncs to desktop', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Chapter', 'topic', 'Shelf');
    await peers.exchange();
    const row = () => peers.desktop.db.prepare(
      'SELECT sequential_reading_enabled AS sequential, desired_retention AS retention, enable_short_term AS shortTerm FROM nodes WHERE id = ?'
    ).get('Shelf');

    renderWithLocalization(<FolderMenu initial={await readSnapshot()} nodeId="Shelf" />);
    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More: Shelf' }));
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Sequential Reading' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    openMenu();
    expect(await screen.findByRole('button', { name: 'Disable Sequential Reading' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Review options' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Shelf' }));
    const retention = sheet.getByRole('slider', { name: 'Review desired retention' });
    fireEvent.change(retention, { target: { value: '85' } });
    await waitFor(() => expect(sheet.getByRole('button', { name: 'Use inherited value' })).toBeVisible());
    fireEvent.click(sheet.getByRole('button', { name: 'Enabled' }));
    // Each choice saves at once; the sheet marks the saved choice when the write has committed.
    await waitFor(() => expect(sheet.getByRole('button', { name: 'Enabled' })).toBeEnabled());
    await peers.exchange();
    expect(row()).toEqual({ sequential: 1, retention: 0.85, shortTerm: 1 });

    fireEvent.click(sheet.getByRole('button', { name: 'Use inherited value' }));
    await waitFor(() => expect(sheet.getByText('Desired retention (Inherited)')).toBeVisible());
    fireEvent.click(sheet.getAllByRole('button', { name: /^Use inherited value/ }).at(-1)!);
    await waitFor(() => expect(sheet.getByRole('button', { name: 'Enabled' })).toBeEnabled());
    await peers.exchange();
    expect(row()).toEqual({ sequential: 1, retention: null, shortTerm: null });
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveNodePrioritySetting } from '../features/nodes/model/nodeReviewSettings';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node, publish } from '../test/dailyFlowExceptions.testSupport';

import { CompanionBrowseMenuSheet } from './CompanionBrowseMenuSheet';
import { ReadingActionsSheet } from './CompanionReadingSheets';
import { CompanionTopicListMenu } from './CompanionTopicListMenu';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

function WorkspaceMenu({ initial, nodeId, useHeader = false, reading = false }: {
  initial: WorkspaceSnapshot; nodeId: string; useHeader?: boolean; reading?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [open, setOpen] = useState(false);
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readSnapshot();
      setSnapshot(next);
      return next;
    }}>
    <CompanionWorkspaceHistoryActions />
    {reading ? <>
      <button type="button" onClick={() => setOpen(true)}>Reading actions</button>
      <ReadingActionsSheet reviewNodeId={nodeId} title={snapshot.nodesById[nodeId]!.title} open={open}
        onOpenChange={setOpen} onFindInDocument={() => {}} onOpenReadingSheet={() => {}} />
    </> : useHeader ? <>
      <button type="button" onClick={() => setOpen(true)}>Folder actions</button>
      <CompanionBrowseMenuSheet page={{ kind: 'folder', nodeId }} menuTitle={snapshot.nodesById[nodeId]!.title}
        open={open} onOpenChange={setOpen} sortKey="dateSaved" sortDirection="desc"
        onChangeSortKey={() => undefined} onChangeSortDirection={() => undefined} />
    </> : <CompanionTopicListMenu nodeId={nodeId} title={snapshot.nodesById[nodeId]!.title} />}
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

    renderWithLocalization(<WorkspaceMenu initial={await readSnapshot()} nodeId="Shelf" />);
    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More: Shelf' }));
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Sequential Reading' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    openMenu();
    expect(await screen.findByRole('button', { name: 'Disable Sequential Reading' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Review options' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review options' }));
    const retention = sheet.getByRole('slider', { name: 'Review desired retention' });
    fireEvent.change(retention, { target: { value: '85' } });
    await waitFor(() => expect(sheet.getByRole('button', { name: 'Use inherited value' })).toBeVisible());
    const shortTerm = sheet.getByRole('switch', { name: 'Short-term learning steps' });
    expect(shortTerm).not.toBeChecked();
    fireEvent.click(shortTerm);
    await waitFor(() => expect(shortTerm).toBeChecked());
    await peers.exchange();
    expect(row()).toEqual({ sequential: 1, retention: 0.85, shortTerm: 1 });

    fireEvent.click(sheet.getByRole('button', { name: 'Use inherited value' }));
    await waitFor(() => expect(sheet.getByText('Desired retention (Inherited)')).toBeVisible());
    fireEvent.click(shortTerm);
    await waitFor(() => expect(shortTerm).not.toBeChecked());
    await peers.exchange();
    expect(row()).toEqual({ sequential: 1, retention: null, shortTerm: 0 });
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('edits a folder priority and enforcement on the phone, preserving and syncing the descendant setting', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Chapter', 'topic', 'Shelf');
    peers.desktop.db.prepare("UPDATE nodes SET priority = 8 WHERE id = 'Chapter'").run();
    publish(peers.desktop, 'Chapter', '2026-11-20T08:00:00.000Z');
    await peers.exchange();
    renderWithLocalization(<WorkspaceMenu initial={await readSnapshot()} nodeId="Shelf" useHeader />);
    const openReview = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }));
      fireEvent.click(screen.getByRole('button', { name: 'Review options' }));
      return within(await screen.findByRole('dialog', { name: 'Review options' }));
    };
    const sheet = await openReview();
    const enforcement = sheet.getByRole('switch', { name: 'Enforce Priority' });
    const expectMobile = async (priority: number | null, enforced: boolean, effective: number) => {
      await waitFor(async () => {
        const nodes = (await readSnapshot()).nodesById;
        expect(nodes.Shelf!.priority ?? null).toBe(priority);
        expect(nodes.Shelf!.enforcePriority === true).toBe(enforced);
        expect(nodes.Chapter!.priority).toBe(8);
        expect(resolveNodePrioritySetting('Chapter', nodes, 5).value).toBe(effective);
      });
    };
    fireEvent.change(sheet.getByRole('slider', { name: 'Priority' }), { target: { value: '2' } });
    await expectMobile(2, false, 8);
    await waitFor(() => expect(enforcement).toBeEnabled());
    fireEvent.click(enforcement);
    await waitFor(() => expect(enforcement).toBeChecked());
    await expectMobile(2, true, 2);
    await peers.exchange();
    expect(peers.desktop.db.prepare('SELECT priority, enforce_priority AS enforce FROM nodes WHERE id = ?')
      .get('Shelf')).toEqual({ priority: 2, enforce: 1 });

    fireEvent.click(enforcement);
    await waitFor(() => expect(enforcement).not.toBeChecked());
    await expectMobile(2, false, 8);
    fireEvent.keyDown(sheet.getByRole('slider', { name: 'Priority' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const undo = screen.getByRole('button', { name: /^Undo/ });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);
    await expectMobile(2, true, 2);

    const reopened = await openReview();
    expect(reopened.getByRole('switch', { name: 'Enforce Priority' })).toBeChecked();
    expect(reopened.getByRole('slider', { name: 'Priority' })).toHaveValue('2');
    expect(within(reopened.getByRole('region', { name: 'Priority' })).queryByRole('button')).toBeNull();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('edits the reading priority only in Review options and opens the enforcing folder from Scheduling', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    const folder = 'English reading and long articles';
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Chapter', 'topic', 'Shelf');
    peers.desktop.db.prepare("UPDATE nodes SET priority = 2, enforce_priority = 1, title = ? WHERE id = 'Shelf'").run(folder);
    publish(peers.desktop, 'Shelf', '2026-11-20T08:00:00.000Z');
    await peers.exchange();
    renderWithLocalization(<WorkspaceMenu initial={await readSnapshot()} nodeId="Chapter" reading />);
    const openActions = () => fireEvent.click(screen.getByRole('button', { name: 'Reading actions' }));
    const close = (dialog: ReturnType<typeof within>) => fireEvent.click(dialog.getByRole('button', { name: 'Close' }));

    openActions();
    expect(screen.getByRole('dialog', { name: 'Chapter' })).not.toContainElement(screen.queryByRole('slider'));
    fireEvent.click(screen.getByRole('button', { name: 'Review options' }));
    const options = within(await screen.findByRole('dialog', { name: 'Review options' }));
    expect(options.getByText(folder)).toBeVisible();
    expect(options.getByRole('img', { name: 'Effective priority P2' })).toBeVisible();
    fireEvent.change(options.getByRole('slider', { name: 'Priority' }), { target: { value: '6' } });
    await waitFor(async () => expect((await readSnapshot()).nodesById.Chapter?.priority).toBe(6));
    close(options);

    openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Scheduling' }));
    const scheduling = within(await screen.findByRole('dialog', { name: 'Scheduling' }));
    expect(scheduling.getByText('P6')).toBeVisible();
    expect(scheduling.getByText('P2')).toBeVisible();
    fireEvent.click(scheduling.getByRole('button', { name: `Source: ${folder}` }));
    const source = within(await screen.findByRole('dialog', { name: `Review options · ${folder}` }));
    const enforce = source.getByRole('switch', { name: 'Enforce Priority' });
    fireEvent.click(enforce);
    await waitFor(() => expect(enforce).not.toBeChecked());
    fireEvent.click(source.getByRole('button', { name: 'Back' }));
    const updated = within(await screen.findByRole('dialog', { name: 'Scheduling' }));
    expect(updated.getByText('P6')).toBeVisible();
    expect(updated.queryByText('P2')).toBeNull();
    await peers.exchange();
    expect(peers.desktop.db.prepare('SELECT priority FROM nodes WHERE id = ?').get('Chapter')).toEqual({ priority: 6 });
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

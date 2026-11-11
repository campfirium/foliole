// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionTopicListMenu } from './CompanionTopicListMenu';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceCreateAction, CompanionWorkspaceHistoryActions,
  useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let initial: WorkspaceSnapshot;
let failRefresh = false;
let refreshBarrier: Promise<void> | undefined;
const stored = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => { library = await createSearchLibrary(0); initial = await stored(); failRefresh = false; refreshBarrier = undefined; });
afterEach(async () => { cleanup(); await library.close(); });

function Menu() {
  const actions = useCompanionWorkspaceActions()!;
  return <>
    <CompanionWorkspaceCreateAction /><CompanionWorkspaceHistoryActions />
    {Object.values(actions.snapshot?.nodesById ?? {}).filter(node => !node.id.startsWith('special-') && !node.deletedAt).map(node =>
      <div key={node.id}>
        <button onClick={() => actions.open({ mode: 'menu', nodeId: node.id, parentNodeId: null })}>{node.title}</button>
        <CompanionTopicListMenu nodeId={node.id} title={node.title} metadata="" onOpen={() => {}} />
      </div>)}
  </>;
}
function Harness() {
  const [snapshot, setSnapshot] = useState(initial);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionWorkspaceActionsProvider snapshot={snapshot}
    flush={async () => {}} restoreFlow={() => {}} flowActive={false} applyFlow={async () => {}}
    refresh={async () => { await refreshBarrier; if (failRefresh) throw new Error('Refresh failed'); const next = await stored(); setSnapshot(next); return next; }}>
    <Menu />
  </CompanionWorkspaceActionsProvider></LocalizationProvider>;
}
async function createFolder(title = 'Created folder') {
  fireEvent.click(screen.getByRole('button', { name: 'Create Folder' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: title } });
  fireEvent.click(within(screen.getByRole('textbox', { name: 'Name' }).closest('form')!).getByRole('button', { name: 'Done' }));
}

it('creates and renames a folder from the real menu, then undoes and redoes both writes', async () => {
  render(<Harness />);
  await createFolder();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Created folder' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Created folder' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed folder' } });
  fireEvent.click(within(screen.getByRole('textbox', { name: 'Name' }).closest('form')!).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Renamed folder' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Created folder' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Created folder' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Created folder' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Renamed folder' })).toBeInTheDocument());
});

it('retries refresh without creating a second object or recording a second action', async () => {
  render(<Harness />);
  failRefresh = true;
  await createFolder();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument());
  expect(library.database.prepare("SELECT COUNT(*) AS count FROM nodes WHERE title = 'Created folder'").get()).toEqual({ count: 1 });
  failRefresh = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Created folder' })).toBeInTheDocument());
  expect((await loadCompanionFlowHistory(companionFlowHistoryKey('Search'))).undoStack).toHaveLength(1);
});

function previewPriorityChange(topic: HTMLElement) {
  const menu = within(screen.getByRole('dialog'));
  expect(menu.getByText('3', { exact: true })).toBeVisible();
  expect(menu.queryByText('0', { exact: true })).toBeNull();
  expect(menu.queryByText('9', { exact: true })).toBeNull();
  fireEvent.change(topic, { target: { value: '3' } });
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.input(topic, { target: { value: '6' } });
  expect(menu.getByText('6', { exact: true })).toBeVisible();
  fireEvent.pointerCancel(topic);
  expect(menu.getByText('3', { exact: true })).toBeVisible();
  fireEvent.input(topic, { target: { value: '0' } });
  expect(menu.getByText('0', { exact: true })).toBeVisible();
}

async function seedPriorityHierarchy() {
  const now = '2026-10-03T00:00:00Z';
  const shapes = [
    { id: 'folder', kind: 'folder', parentNodeId: null, priority: 3 },
    { id: 'topic', kind: 'topic', parentNodeId: 'folder' },
    { id: 'item', kind: 'item', parentNodeId: 'topic' }
  ] as const;
  await applyCompanionLocalNodeVersions(await Promise.all(shapes.map(node => toWorkspaceNativeNodeVersion({
    ...node, title: node.id, content: 'Body', reveal: node.kind === 'item' ? 'Answer' : null,
    createdAt: now, updatedAt: now, isTitleManual: true, hideTitleHeading: false,
    anchorLink: null, review: null, reading: null
  }, 'Search', `base-${node.id}`))));
  initial = await stored();
}

it('saves only a committed slider adjustment, updates inherited values and can undo the override', async () => {
  await seedPriorityHierarchy();
  render(<Harness />);
  const open = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`: ${name}$`) }));
    return screen.getByRole('slider', { name: 'Priority' });
  };
  const facts = () => library.database.prepare('SELECT id, priority FROM nodes WHERE id IN (?, ?) ORDER BY id').all('topic', 'item');

  const topic = open('topic');
  previewPriorityChange(topic);
  expect(facts()).toEqual([{ id: 'item', priority: null }, { id: 'topic', priority: null }]);
  fireEvent.change(topic, { target: { value: '0' } });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(facts()).toEqual([{ id: 'item', priority: null }, { id: 'topic', priority: 0 }]);

  const item = open('item');
  await waitFor(() => expect(item).toBeEnabled());
  expect(item).toHaveValue('0');
  fireEvent.change(item, { target: { value: '7' } });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(facts()[0]).toEqual({ id: 'item', priority: 7 });
  const undo = screen.getByRole('button', { name: 'Undo' });
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  await waitFor(() => expect(facts()).toEqual([{ id: 'item', priority: null }, { id: 'topic', priority: 0 }]));
  const restored = open('item');
  await waitFor(() => expect(restored).toBeEnabled());
  expect(restored).toHaveValue('0');

  library.database.exec(`CREATE TRIGGER reject_priority BEFORE UPDATE OF priority ON nodes
    WHEN NEW.id = 'item' BEGIN SELECT RAISE(ABORT, 'priority rejected'); END`);
  fireEvent.change(restored, { target: { value: '8' } });
  await waitFor(() => {
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(restored).toHaveValue('0');
    expect(within(screen.getByRole('dialog')).getByText('0', { exact: true })).toBeVisible();
  });
  expect(facts()[0]).toEqual({ id: 'item', priority: null });
  library.database.exec('DROP TRIGGER reject_priority');

  failRefresh = true;
  const blockedRefresh = Promise.withResolvers<void>();
  refreshBarrier = blockedRefresh.promise;
  fireEvent.change(restored, { target: { value: '8' } });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(facts()[0]).toEqual({ id: 'item', priority: 8 });
  blockedRefresh.resolve();
  const retry = await screen.findByRole('button', { name: 'Refresh' });
  const historyKey = companionFlowHistoryKey('Search');
  const historyBeforeRetry = await loadCompanionFlowHistory(historyKey);
  expect(facts()[0]).toEqual({ id: 'item', priority: 8 });
  failRefresh = false;
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull());
  expect(open('item')).toHaveValue('8');
  expect(await loadCompanionFlowHistory(historyKey)).toEqual(historyBeforeRetry);
});

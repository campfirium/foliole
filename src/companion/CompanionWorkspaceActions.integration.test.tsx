// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionWorkspaceActionsProvider, CompanionWorkspaceCreateAction, CompanionWorkspaceHistoryActions,
  useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let initial: WorkspaceSnapshot;
let failRefresh = false;
const stored = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => { library = await createSearchLibrary(0); initial = await stored(); failRefresh = false; });
afterEach(async () => { cleanup(); await library.close(); });

function Menu() {
  const actions = useCompanionWorkspaceActions()!;
  return <>
    <CompanionWorkspaceCreateAction /><CompanionWorkspaceHistoryActions />
    {Object.values(actions.snapshot?.nodesById ?? {}).filter(node => !node.id.startsWith('special-') && !node.deletedAt).map(node =>
      <button key={node.id} onClick={() => actions.open({ mode: 'menu', nodeId: node.id, parentNodeId: null })}>{node.title}</button>)}
  </>;
}
function Harness() {
  const [snapshot, setSnapshot] = useState(initial);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionWorkspaceActionsProvider snapshot={snapshot}
    flush={async () => {}} restoreFlow={() => {}} flowActive={false} applyFlow={async () => {}}
    refresh={async () => { if (failRefresh) throw new Error('Refresh failed'); const next = await stored(); setSnapshot(next); return next; }}>
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

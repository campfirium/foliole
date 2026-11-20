import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { ReminderDraftProvider } from '../features/settings/context/ReminderDraftRequest';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveCompanionDiveStarter } from './companionStartDive';
import { CompanionTopBar } from './CompanionTopBar';
import { CompanionWorkspaceActionsProvider } from './CompanionWorkspaceActions';
import { useCompanionTopBarProps } from './useCompanionTopBarProps';
import { createSyncState } from './useCompanionWorkspaceSync.testSupport';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  isAvailableNativeCompanionRuntime: () => true
}));
vi.mock('../shared/platform/companionBootstrap', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionBootstrap')>(),
  isNativeCompanionRuntime: () => true
}));

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

function node(id: string, title: string, parentNodeId: string | null = null): WorkspaceSnapshot['nodesById'][string] {
  return {
    id, title, parentNodeId, kind: 'folder', content: '', isTitleManual: true, hideTitleHeading: false,
    reveal: null, anchorLink: null, reading: null, review: null, createdAt: '2026-11-09', updatedAt: '2026-11-09'
  };
}

type TopBarArgs = Parameters<typeof useCompanionTopBarProps>[0];
const noop = () => undefined;

function Directory({ snapshot, start, openReminders, initialSelection = { kind: 'root' }, directoryOpen = true }: {
  snapshot: WorkspaceSnapshot;
  start: TopBarArgs['surface']['openDiveFlow'];
  openReminders: () => void;
  initialSelection?: CompanionDirectorySelection;
  directoryOpen?: boolean;
}) {
  const [selection, setSelection] = useState(initialSelection);
  const topBarProps = useCompanionTopBarProps({
    directorySelection: selection, browseSortDirection: 'asc', browseSortKey: 'name',
    externalDirectory: { entries: [], folders: [] }, isBrowseDirectoryOpen: directoryOpen,
    resetDirectorySelection: next => setSelection(next ?? { kind: 'root' }),
    setBrowseSortDirection: noop, setBrowseSortKey: noop, setIsBrowseDirectoryOpen: noop,
    setIsCaptureSheetOpen: noop, setSettingsPage: noop, settingsPage: 'list',
    surface: { activeAction: 'recent', openDiveFlow: start } as TopBarArgs['surface'],
    workspaceSync: { state: createSyncState(snapshot), status: 'idle' } as unknown as TopBarArgs['workspaceSync']
  });
  return <ReminderDraftProvider openReminders={openReminders}>
    <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={noop}
      flowActive={false} applyFlow={async () => {}} refresh={async () => snapshot}>
      <CompanionTopBar {...topBarProps} visible />
      <CompanionDirectoryContent onStartDive={resolveCompanionDiveStarter(snapshot, start)}
        selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection} onSelectNode={noop}
        snapshot={snapshot} sortDirection="asc" sortKey="name" />
    </CompanionWorkspaceActionsProvider>
  </ReminderDraftProvider>;
}

it('opens Dive details and starts Flow or creates a reminder from the top menu', () => {
  const nodesById = {
    dive: { ...node('dive', 'Probability'), virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['source'] },
    source: node('source', 'Reference shelf'),
    member: { ...node('member', 'Statistics primer', 'source'), kind: 'topic' as const }
  };
  const snapshot: WorkspaceSnapshot = {
    nodesById, nodeOrder: Object.keys(nodesById), trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {}
  };
  const start = vi.fn();
  const openReminders = vi.fn();
  const view = renderWithLocalization(<Directory snapshot={snapshot} start={start} openReminders={openReminders} />);
  expect(screen.getByRole('heading', { name: 'Dive' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder Probability' }));
  expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open folder Reference shelf' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Topics' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open topic Statistics primer' })).toBeVisible();

  expect(screen.queryByRole('button', { name: 'Start Dive' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More: Probability' })).toBeNull();
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  let menu = within(screen.getByRole('dialog', { name: 'Dive menu' }));
  expect(menu.queryByText('Sort', { exact: true })).toBeNull();
  expect(menu.queryByRole('button', { name: /^(New…|Create Folder|Create Dive|Create in Virtual)$/ })).toBeNull();
  fireEvent.click(menu.getByRole('button', { name: 'Create reminder…' }));
  expect(openReminders).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  menu = within(screen.getByRole('dialog', { name: 'Dive menu' }));
  fireEvent.click(menu.getByRole('button', { name: 'Start Dive' }));
  expect(start).toHaveBeenCalledExactlyOnceWith({ id: 'dive', topicIds: ['member'] });
  expect(screen.queryByRole('dialog')).toBeNull();

  view.rerender(<Directory start={start} openReminders={openReminders} snapshot={{ ...snapshot, nodesById: {
    ...nodesById, member: { ...nodesById.member, parentNodeId: null }
  } }} />);
  expect(screen.getByRole('button', { name: 'Open folder Reference shelf' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open topic Statistics primer' })).toBeNull();
});

const creationSnapshot: WorkspaceSnapshot = {
  nodesById: { folder: node('folder', 'Library folder') },
  nodeOrder: ['folder'], trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {}
};

function openBrowseMenu() {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  return within(screen.getByRole('dialog', { name: 'Browse menu' }));
}

it('offers a single New entry on the directory home and leaves one sheet open when a type is picked', () => {
  renderWithLocalization(<Directory snapshot={creationSnapshot} start={vi.fn()} openReminders={noop} />);
  let menu = openBrowseMenu();
  expect(menu.queryByRole('button', { name: /^(Create Folder|Create Dive|Create in Virtual)$/ })).toBeNull();
  fireEvent.click(menu.getByRole('button', { name: 'New…' }));
  const sheet = screen.getByRole('dialog', { name: 'New' });
  menu = within(sheet);
  expect(menu.getByRole('button', { name: 'Folder' })).toBeVisible();
  expect(menu.getByRole('button', { name: 'Dive' })).toBeVisible();
  expect(menu.getByRole('button', { name: 'Virtual' })).toBeVisible();
  fireEvent.click(menu.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('dialog', { name: 'Browse menu' })).toBe(sheet);
  fireEvent.click(screen.getByRole('button', { name: 'New…' }));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Folder' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
  fireEvent.click(screen.getByLabelText('Done'));
  expect(openBrowseMenu().getByRole('button', { name: 'New…' })).toBeVisible();
});

it.each([
  ['recent', { kind: 'root' }, false],
  ['folder', { kind: 'internal', nodeId: 'folder' }, true],
  ['virtual', { kind: 'virtual', nodeId: 'index' }, true],
  ['trash', { kind: 'trash' }, true],
  ['external', { kind: 'externalFolder', folderId: 'external' }, true]
] as const)('omits global creation in the %s menu', (_page, initialSelection, directoryOpen) => {
  renderWithLocalization(<Directory snapshot={creationSnapshot} initialSelection={initialSelection}
    directoryOpen={directoryOpen} start={vi.fn()} openReminders={noop} />);
  expect(openBrowseMenu().queryByRole('button', { name: /^(New…|Create Folder|Create Dive|Create in Virtual)$/ })).toBeNull();
});

it('starts a Dive directly from its directory row menu', () => {
  const dive = { ...node('dive', 'Probability'), virtualFilter: DIVE_NODE_FILTER, manualChildOrder: [] };
  const snapshot: WorkspaceSnapshot = {
    nodesById: { dive }, nodeOrder: ['dive'], trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {}
  };
  const start = vi.fn();
  renderWithLocalization(<Directory snapshot={snapshot} start={start} openReminders={noop} />);

  fireEvent.click(screen.getByRole('button', { name: 'More: Probability' }));
  const menu = within(screen.getByRole('dialog', { name: 'More' }));
  fireEvent.click(menu.getByRole('button', { name: 'Start Dive' }));
  expect(start).toHaveBeenCalledExactlyOnceWith({ id: 'dive', topicIds: [] });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open folder Probability' })).toBeVisible();
});

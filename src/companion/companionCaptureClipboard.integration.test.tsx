// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import type { CompanionDirectorySelection } from './CompanionDirectoryModel';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionCaptureController } from './useCompanionCaptureController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const clipboard = vi.hoisted(() => ({ text: '# Pasted title\n\nPasted body' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: (name: string) => name === 'FolioleCompanionBootstrap'
      ? { readClipboardText: async () => ({ text: clipboard.text }) } : createCompanionNativeSyncStub()
  };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  window.localStorage.clear(); library = await createSearchLibrary(0);
  const insert = library.database.prepare("INSERT INTO nodes (id,kind,title,content,parent_id,created_at,updated_at) VALUES (?,'folder',?,'',?,'now','now')");
  insert.run('physical-folder', 'Physical folder', null);
  insert.run('other-folder', 'Other folder', null);
  insert.run('special-virtual-root', 'Virtual', null);
  insert.run('virtual-folder', 'Virtual folder', 'special-virtual-root');
  insert.run('nested-virtual', 'Nested virtual folder', 'virtual-folder');
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

type InitialState = Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>>;
function CaptureSurface(props: { initial: InitialState; directory: boolean; folder: string | null; selection: CompanionDirectorySelection }) {
  const [state, setState] = useState(props.initial);
  const [selection, setSelection] = useState(props.selection);
  const [directory, setDirectory] = useState(props.directory);
  const [article, setArticle] = useState<WorkspaceNodeSnapshot | null>(null);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const workspaceSync = { ...actions, state, bootstrapState: { device_id: 'clipboard-device' } } as ReturnType<typeof useCompanionWorkspaceSync>;
  const capture = useCompanionCaptureController({ directorySelection: selection, isBrowseDirectoryOpen: directory,
    setIsBrowseDirectoryOpen: setDirectory, workspaceSync,
    surface: { browsedFolder: props.folder ? { nodeId: props.folder, title: 'Folder', items: [] } : null,
      handleSelectBrowseNode: nodeId => { void loadCompanionWorkspaceNode(nodeId).then(setArticle); } } });
  return <>
    <button onClick={() => capture.setIsCaptureSheetOpen(true)}>Add</button>
    <button onClick={() => setSelection({ kind: 'internal', nodeId: 'other-folder' })}>Change location</button>
    {article ? <article data-testid="opened-topic" data-node-id={article.id}><h1>{article.title}</h1>{article.content}</article> : null}
    <CompanionCaptureSheet draftScope="clipboard-integration" onSave={capture.handleSaveCaptureText}
      open={capture.isCaptureSheetOpen} onOpenChange={capture.setIsCaptureSheetOpen} onClipboardCreated={capture.handleOpenCapturedNode} />
  </>;
}
async function openCapture(selection: CompanionDirectorySelection = { kind: 'internal', nodeId: 'physical-folder' }, directory = true, folder: string | null = null) {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} directory={directory} folder={folder} selection={selection} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}
const paste = () => fireEvent.click(screen.getByRole('button', { name: 'Paste from Clipboard' }));
const imported = () => library.database.prepare("SELECT id, parent_id, title FROM nodes WHERE title = 'Pasted title'").all();

it.each([
  ['physical directory', { kind: 'internal', nodeId: 'physical-folder' }, true, null, 'physical-folder'],
  ['physical Browse folder', { kind: 'root' }, false, 'physical-folder', 'physical-folder'],
  ['virtual directory', { kind: 'virtual', nodeId: 'virtual-folder' }, true, null, 'special-inbox'],
  ['virtual Browse folder', { kind: 'root' }, false, 'virtual-folder', 'special-inbox'],
  ['nested virtual Browse folder', { kind: 'root' }, false, 'nested-virtual', 'special-inbox'],
  ['aggregate Browse', { kind: 'root' }, false, null, 'special-inbox']
] as const)('directly creates at the origin and opens the persisted body from %s', async (_name, selection, directory, folder, parent) => {
  await openCapture(selection, directory, folder);
  paste();
  const article = await screen.findByTestId('opened-topic');
  expect(article).toHaveTextContent('Pasted body');
  expect(screen.queryByRole('dialog', { name: 'Capture' })).toBeNull();
  expect(imported()).toEqual([{ id: article.getAttribute('data-node-id'), parent_id: parent, title: 'Pasted title' }]);
  const nodeId = article.getAttribute('data-node-id')!;
  await reopenSearchLibrary(library.root, '2026-10-30T00:00:00Z');
  await loadCompanionWorkspaceSyncState();
  expect(await loadCompanionWorkspaceNode(nodeId)).toMatchObject({ content: clipboard.text, parentNodeId: parent });
});

it('freezes the physical target at Add and uses it for manual text saves too', async () => {
  await openCapture();
  fireEvent.click(screen.getByRole('button', { name: 'Change location', hidden: true }));
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Manual text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Capture' })).toBeNull());
  expect(library.database.prepare("SELECT parent_id FROM nodes WHERE title = 'Manual text'").get()).toEqual({ parent_id: 'physical-folder' });
});

it.each(['target', 'ancestor'])('does not redirect to Inbox if the original physical %s was deleted after opening', async deleted => {
  if (deleted === 'ancestor') library.database.prepare("UPDATE nodes SET parent_id = 'other-folder' WHERE id = 'physical-folder'").run();
  await openCapture();
  library.database.prepare("UPDATE nodes SET deleted_at = '2026-10-30T00:00:00Z' WHERE id = ?")
    .run(deleted === 'target' ? 'physical-folder' : 'other-folder');
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('This location is no longer available');
  expect(imported()).toEqual([]);
  expect(screen.queryByTestId('opened-topic')).toBeNull();
});

it('keeps the sheet on a rolled back creation without opening an uncommitted topic', async () => {
  await openCapture();
  library.database.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON nodes WHEN NEW.title = 'Pasted title' BEGIN SELECT RAISE(ABORT, 'Write unavailable'); END");
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(imported()).toEqual([]);
  expect(screen.queryByTestId('opened-topic')).toBeNull();
});

it('opens the committed topic after a failed refresh without creating it twice', async () => {
  await openCapture();
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation');
  refresh.mockRejectedValueOnce(new Error('Read unavailable'));
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  const saved = imported();
  expect(saved).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByTestId('opened-topic')).toHaveTextContent('Pasted body');
  expect(imported()).toEqual(saved);
  expect(screen.queryByRole('dialog', { name: 'Capture' })).toBeNull();
});

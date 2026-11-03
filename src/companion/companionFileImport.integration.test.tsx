// @vitest-environment jsdom
import { File } from 'node:buffer';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { readFramedSyncObjectPayload } from '../../lib/core/sync/framedSyncObjectStatePayload';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import * as snapshots from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionCaptureController } from './useCompanionCaptureController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const runtime = vi.hoisted(() => ({ platform: 'android' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => runtime.platform, isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { window.localStorage.clear(); library = await createSearchLibrary(0); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

function CaptureSurface(props: { initial: Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>> }) {
  const [state, setState] = useState(props.initial);
  const [article, setArticle] = useState<WorkspaceNodeSnapshot | null>(null);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const workspaceSync = { ...actions, state, bootstrapState: { device_id: 'file-device' } } as ReturnType<typeof useCompanionWorkspaceSync>;
  const capture = useCompanionCaptureController({ directorySelection: { kind: 'root' }, isBrowseDirectoryOpen: false,
    setIsBrowseDirectoryOpen: () => {}, workspaceSync, surface: { browsedFolder: null,
      handleSelectBrowseNode: id => { void loadCompanionWorkspaceNode(id).then(setArticle); } } });
  return <>
    <button onClick={() => capture.setIsCaptureSheetOpen(true)}>Add</button>
    {article ? <article data-testid="imported-topic" data-id={article.id}>{article.title} {article.content}</article> : null}
    <CompanionCaptureSheet draftScope="file-integration" open={capture.isCaptureSheetOpen}
      onOpenChange={capture.setIsCaptureSheetOpen} onSave={capture.handleSaveCaptureText}
      onImportFile={capture.handleImportFile} onClipboardCreated={capture.handleOpenCapturedNode} />
  </>;
}

async function openCapture() {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Draft stays here' } });
}
function choose(body: string | Uint8Array = '# Imported title\r\n\r\nA readable body', name = 'source.txt') {
  const file = new File([typeof body === 'string' ? body : Uint8Array.from(body)], name);
  fireEvent.change(screen.getByLabelText('Upload File'), { target: { files: [file] } });
}
const runs = () => library.database.prepare('SELECT * FROM import_runs').all() as Record<string, unknown>[];

it.each(['android', 'ios'])('imports through the %s production owner, preserves source identity and reopens the persisted body', async platform => {
  runtime.platform = platform;
  await openCapture(); choose();
  const article = await screen.findByTestId('imported-topic');
  expect(article).toHaveTextContent('A readable body');
  const id = article.getAttribute('data-id')!;
  const run = runs()[0]!;
  expect(run).toMatchObject({ source_kind: 'text', source_name: 'source.txt', node_id: id,
    duplicate_semantic: 'new', result_status: 'imported' });
  const payload = await getIosCompanionDatabaseOwner().runWriter(db => readFramedSyncObjectPayload(db,
    { globalId: run.source_fingerprint as string, objectType: 'import_source' }));
  const sync = library.database.prepare("SELECT content_hash FROM sync_object_state WHERE object_type='import_source'").get();
  expect(sync).toEqual({ content_hash: computeSyncContentHash('import_source', JSON.parse(payload!)) });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByLabelText('Capture text')).toHaveValue('Draft stays here');
  await reopenSearchLibrary(library.root, '2026-11-03T01:00:00Z');
  await loadCompanionWorkspaceSyncState();
  expect(await loadCompanionWorkspaceNode(id)).toMatchObject({
    title: 'Imported title', content: '# Imported title\n\nA readable body',
    hideTitleHeading: true, isTitleManual: true, importSourceFingerprint: run.source_fingerprint,
    importContentFingerprint: run.content_fingerprint
  });
});

it('uses the desktop filename title and collision suffix for files without a heading', async () => {
  await openCapture(); choose('First body');
  await screen.findByTestId('imported-topic');
  fireEvent.click(screen.getByRole('button', { name: 'Add' })); choose('Second body');
  await waitFor(() => expect(runs()).toHaveLength(2));
  const titles = library.database.prepare("SELECT title FROM nodes WHERE kind='topic' ORDER BY title").all();
  expect(titles).toEqual([{ title: 'source' }, { title: 'source 2' }]);
});

it.each([
  ['unsupported format', 'Readable body', 'source.epub'],
  ['empty file', '', 'source.txt'],
  ['invalid declared UTF-8', new Uint8Array([0xef, 0xbb, 0xbf, 0xff]), 'source.txt']
])('rejects %s without saving a topic or clearing the draft', async (_label, body, name) => {
  await openCapture(); choose(body, name);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(runs()).toEqual([]);
  expect(screen.getByLabelText('Capture text')).toHaveValue('Draft stays here');
  expect(screen.queryByTestId('imported-topic')).toBeNull();
});

it('rolls back the topic and version if the import record cannot be saved', async () => {
  await openCapture();
  library.database.exec("CREATE TRIGGER reject_import BEFORE INSERT ON import_runs BEGIN SELECT RAISE(ABORT, 'Unavailable'); END");
  choose();
  await screen.findByRole('alert');
  expect(runs()).toEqual([]);
  expect(library.database.prepare("SELECT id FROM nodes WHERE title='Imported title'").all()).toEqual([]);
  expect(library.database.prepare('SELECT object_id FROM node_sync_versions').all()).toEqual([]);
  expect(library.database.prepare('SELECT source_fingerprint FROM import_sources').all()).toEqual([]);
  expect(screen.getByLabelText('Capture text')).toHaveValue('Draft stays here');
});

it('does not redirect an import when its destination was deleted during file selection', async () => {
  await openCapture();
  library.database.prepare("UPDATE nodes SET deleted_at='now' WHERE id='special-inbox'").run();
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('This location is no longer available');
  expect(runs()).toEqual([]);
});

it('retries only refreshing after a committed import without importing the file twice', async () => {
  await openCapture();
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockRejectedValueOnce(new Error('Read failed'));
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  const saved = runs(); expect(saved).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByTestId('imported-topic')).toHaveTextContent('A readable body');
  expect(runs()).toEqual(saved);
});

it('retries refreshing when projection loading fails after the transaction committed', async () => {
  await openCapture();
  vi.spyOn(snapshots, 'updateCommittedCompanionWorkspace').mockRejectedValueOnce(new Error('Projection unavailable'));
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  const saved = runs(); expect(saved).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByTestId('imported-topic')).toHaveTextContent('A readable body');
  expect(runs()).toEqual(saved);
});

it('does not import after the capture sheet closes while the file bytes are still being read', async () => {
  await openCapture();
  let finish!: (buffer: ArrayBuffer) => void;
  const arrayBuffer = new Promise<ArrayBuffer>(resolve => { finish = resolve; });
  fireEvent.change(screen.getByLabelText('Upload File'), { target: {
    files: [{ name: 'source.txt', arrayBuffer: () => arrayBuffer }]
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  finish(new TextEncoder().encode('Cancelled file body').buffer);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(runs()).toEqual([]);
  expect(screen.queryByTestId('imported-topic')).toBeNull();
});

it('rejects the selected file if the library owner changes before reading finishes', async () => {
  await openCapture();
  let finish!: (buffer: ArrayBuffer) => void;
  const arrayBuffer = new Promise<ArrayBuffer>(resolve => { finish = resolve; });
  fireEvent.change(screen.getByLabelText('Upload File'), { target: {
    files: [{ name: 'source.txt', arrayBuffer: () => arrayBuffer }]
  } });
  const reopened = await reopenSearchLibrary(library.root, '2026-11-03T02:00:00Z');
  finish(new TextEncoder().encode('Wrong library body').buffer);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(reopened.db.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(screen.getByLabelText('Capture text')).toHaveValue('Draft stays here');
});

it('installs the shared import history table when reopening an existing companion library', async () => {
  library.database.exec('DROP TABLE import_runs');
  const reopened = await reopenSearchLibrary(library.root, '2026-11-03T03:00:00Z');
  await openCapture(); choose('A file imported after upgrading the existing library');
  expect(await screen.findByTestId('imported-topic')).toHaveTextContent('A file imported after upgrading');
  expect(reopened.db.prepare('SELECT source_name FROM import_runs').all()).toEqual([{ source_name: 'source.txt' }]);
  expect(reopened.db.prepare("SELECT id FROM nodes WHERE id='special-inbox'").get()).toEqual({ id: 'special-inbox' });
});

// @vitest-environment jsdom
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';
import { loadCompanionReadableArticle, loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { createCompanionExistingHighlightRangeHandler, createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

const content = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta';
const payload: SelectionCommandPayload = {
  parentNodeId: 'source', anchorId: 'beta', selectionText: 'Beta', clozeContent: '',
  entries: [{ anchorId: 'beta', selectionText: 'Beta', clozeContent: '',
    range: { from: 6, to: 10 }, locator: { from: 6, to: 10, originalText: 'Beta' } }]
};
let directory: string;
let database: Database.Database | null;

async function openLibrary() {
  const path = join(directory, 'library.db');
  const existed = existsSync(path);
  const sqlite = new Database(path);
  database = sqlite;
  await initializeIosCompanionDatabase({
    booted_at: '2026-11-20T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Existing highlight edge scroll fixture', runtime_kind: 'android-capacitor'
  }, createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; }));
}

beforeEach(async () => {
  const artifacts = join(process.cwd(), '.tmp/artifacts');
  mkdirSync(artifacts, { recursive: true });
  directory = mkdtempSync(join(artifacts, 'highlight-edge-scroll-'));
  await openLibrary();
  database!.prepare(`INSERT INTO nodes (id, title, kind, content, created_at, updated_at)
    VALUES ('source', 'Source', 'topic', ?, '2026-11-20', '2026-11-20')`).run(content);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(directory, { recursive: true, force: true });
});

function Reader({ initial }: { initial: Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>> }) {
  const [state, setState] = useState(initial);
  const [article, setArticle] = useState<Awaited<ReturnType<typeof loadCompanionReadableArticle>>>(null);
  useEffect(() => {
    void loadCompanionReadableArticle(state.workspace_snapshot, 'source').then(setArticle);
  }, [state.workspace_snapshot]);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const sync = { ...actions, state, bootstrapState: { device_id: 'test-device' } } as ReturnType<typeof useCompanionWorkspaceSync>;
  if (!article) return null;
  return <MouseGestureSettingsProvider><CompanionDraftProvider>
    <output data-testid="restored-scroll-top">{article.persistedNodeViewState?.scrollTop ?? 0}</output>
    <ImmersiveReadableArticle onExit={() => {}} snapshot={state.workspace_snapshot} readableArticle={article}
      onCreateSelectionAnnotation={createCompanionSelectionAnnotationHandler(sync)}
      onAdjustExistingHighlightRange={createCompanionExistingHighlightRangeHandler(sync)} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
}

function touchPointer(target: Element | Document, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  fireEvent(target, event);
}

it.each([0, 20])('keeps both the handles and the reading position while extending a saved highlight past the bottom edge from %ipx', async (startTop) => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  let surface: HTMLElement | null = null;
  // jsdom has no layout. Text far above the viewport leaves the rendered range, as in CodeMirror.
  vi.spyOn(CodeMirrorEditorAdapter.prototype, 'getPositionClientRect').mockImplementation(position =>
    surface && position + 30 < surface.scrollTop - startTop ? null : new DOMRect(position * 4, 100, 4, 20));
  vi.spyOn(CodeMirrorEditorAdapter.prototype, 'getDocumentPositionAtClientPoint')
    .mockImplementation(x => Math.min(content.length, Math.round(x / 4) + (surface ? surface.scrollTop - startTop : 0)));
  const { container } = renderWithLocalization(<Reader initial={await loadCompanionWorkspaceSyncState()} />);
  const highlight = await waitFor(() => {
    const element = container.querySelector('.cm-md-highlight');
    expect(element).not.toBeNull();
    return element!;
  });
  surface = container.querySelector<HTMLElement>('[data-companion-reading-surface]')!;
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300));
  // The reader scrolled and its position was saved after the article opened.
  surface.scrollTop = startTop;
  fireEvent.scroll(surface);
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: startTop });

  fireEvent.click(highlight, { clientX: 32, clientY: 110 });
  const end = await screen.findByRole('button', { name: 'Adjust anchor end' });
  await waitFor(() => expect(end).toBeEnabled());
  touchPointer(end, 'pointerdown', 40, 110);
  touchPointer(document, 'pointermove', 40, 290);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 90)); });
  expect(surface.scrollTop).toBeGreaterThan(startTop + 36);
  expect(screen.queryByRole('button', { name: 'Adjust anchor start' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Adjust anchor end' })).toBeInTheDocument();
  touchPointer(document, 'pointerup', 40, 290);
  const draggedTop = surface.scrollTop;

  const expectedTo = Math.min(content.length, 10 + draggedTop - startTop);
  await waitFor(async () => expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.anchorLink?.locator)
    .toEqual({ from: 6, to: expectedTo, originalText: content.slice(6, expectedTo) }));
  await waitFor(() => expect(screen.getByTestId('restored-scroll-top')).toHaveTextContent(String(startTop)));
  expect(surface.scrollTop).toBe(draggedTop);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.anchorLink?.locator)
    .toMatchObject({ from: 6, to: expectedTo });
});

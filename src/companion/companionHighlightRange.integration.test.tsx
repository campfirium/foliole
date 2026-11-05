// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { addNoteToCompanionExistingHighlight } from './companionExistingHighlightPersistence';
import { persistCompanionHighlightRange } from './companionHighlightRangePersistence';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import * as controllers from './companionSelectionAnnotationController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const body = 'Alpha Beta Gamma';
const payload: SelectionCommandPayload = {
  parentNodeId: 'source', anchorId: 'beta', selectionText: 'Beta', clozeContent: 'Alpha [...] Gamma',
  entries: [{ anchorId: 'beta', selectionText: 'Beta', clozeContent: 'Alpha [...] Gamma',
    range: { from: 6, to: 10 }, locator: { from: 6, to: 10, originalText: 'Beta' } }]
};
let root = '';
let database: Database.Database | null = null;

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  database = new Database(file);
  await initializeIosCompanionDatabase({ booted_at: '2026-11-05', database_path: null,
    database_ready: false, host_name: 'Android range fixture', runtime_kind: 'android-capacitor'
  }, createFakeCapacitorDatabaseManager(database, existed, () => { database = null; }));
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-highlight-range-'));
  await openLibrary();
  database!.prepare(`INSERT INTO nodes (id, title, content, kind, created_at, updated_at)
    VALUES ('source', 'Source', ?, 'topic', '2026-11-05', '2026-11-05')`).run(body);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

// Geometry is supplied by the native editor; selection, mutation, refresh and SQLite remain real.
function editor(): EditorAdapter {
  return { getContent: () => body, onScroll: () => () => {},
    getPositionClientRect: (position: number) => new DOMRect(position * 8, 80, 8, 20),
    getDocumentPositionAtClientPoint: (x: number) => Math.round(x / 8),
    setHighlightRangePreview: vi.fn()
  } as unknown as EditorAdapter;
}

function Surface({ initial, nodeId, cloze = false, refreshFailures = 0 }: {
  initial: NativeCompanionWorkspaceSyncState; nodeId: string; cloze?: boolean; refreshFailures?: number;
}) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const [adapter] = useState(editor);
  const remainingFailures = useRef(refreshFailures);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const sync = { ...actions, state, bootstrapState: { device_id: 'range-device' },
    refreshAfterMutation: (...args: Parameters<typeof actions.refreshAfterMutation>) => {
      if (remainingFailures.current-- > 0) return Promise.reject(new Error('refresh failed'));
      return actions.refreshAfterMutation(...args);
    }
  } as ReturnType<typeof useCompanionWorkspaceSync>;
  return <CompanionDraftProvider>
    <button onClick={() => setOpen(false)}>Dismiss</button><button onClick={() => setOpen(true)}>Reopen</button>
    <SelectionAnnotationToolbarLayer editor={adapter} parentNodeId="source"
      onAdjustExistingHighlightRange={controllers.createCompanionExistingHighlightRangeHandler(sync)}
      onAddExistingHighlightNote={controllers.createCompanionExistingHighlightNoteHandler(sync)}
      onClose={() => setOpen(false)} snapshot={state.workspace_snapshot} resolveSelectionPayload={() => null}
      state={open ? { left: 20, top: 140, noteLeft: 20, noteTop: 190, payload: null,
        existingHighlight: { nodeId, originalText: 'Beta', kind: cloze ? 'cloze' : 'highlight' } } : null} />
  </CompanionDraftProvider>;
}

it.each(['note', 'cloze'] as const)('adjusts %s through handles and retains the updated content after restart', async kind => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind, payload,
    note: 'Keep this note', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  renderWithLocalization(<Surface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} cloze={kind === 'cloze'} />);
  const end = await screen.findByRole('button', { name: 'Adjust anchor end' });
  await waitFor(() => expect(end).toBeEnabled());
  await act(async () => {
    fireEvent.pointerDown(end, { pointerId: 1, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 128, clientY: 90 });
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
  await waitFor(async () => expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.anchorLink?.locator)
    .toEqual({ from: 6, to: 16, originalText: 'Beta Gamma' }));
  expect(screen.getByRole('button', { name: 'Adjust anchor start' })).toBeVisible();
  if (kind === 'note') {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    fireEvent.change(screen.getByTestId('companion-selection-note-text'), { target: { value: 'Keep this note updated' } });
    fireEvent.click(screen.getByTestId('companion-selection-note-save'));
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  }
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('button', { name: 'Adjust anchor end' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(await screen.findByRole('button', { name: 'Adjust anchor end' })).toBeVisible();
  cleanup();
  await closeIosCompanionDatabase();
  await openLibrary();
  const hydrated = await loadCompanionWorkspaceNode(saved!.nodeId);
  expect(hydrated?.anchorLink?.locator).toEqual({ from: 6, to: 16, originalText: 'Beta Gamma' });
  if (kind === 'note') {
    expect(hydrated?.content).toContain('Beta Gamma');
    expect(hydrated?.content).toContain('Keep this note updated');
  } else {
    expect(hydrated?.content).toBe('Alpha [...]');
    expect(hydrated?.reveal).toBe('Beta Gamma');
  }
});

it('retries a failed projection refresh without writing the saved range a second time', async () => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  renderWithLocalization(<Surface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} refreshFailures={1} />);
  const end = await screen.findByRole('button', { name: 'Adjust anchor end' });
  await waitFor(() => expect(end).toBeEnabled());
  await act(async () => {
    fireEvent.pointerDown(end, { pointerId: 1, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 128, clientY: 90 });
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
  const retry = await screen.findByRole('button', { name: 'Refresh' });
  const beforeRetry = await loadCompanionWorkspaceNode(saved!.nodeId);
  expect(beforeRetry?.anchorLink?.locator).toEqual({ from: 6, to: 16, originalText: 'Beta Gamma' });
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Adjust anchor end' })).toBeEnabled());
  expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.currentVersionId).toBe(beforeRetry?.currentVersionId);
});

it('rejects a range based on a changed parent without replacing the saved annotation', async () => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'note', payload,
    note: 'Original note', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const read = await readCompanionHighlight(snapshot, saved!.nodeId);
  database!.prepare("UPDATE nodes SET content = ?, current_version_id = 'changed-parent' WHERE id = 'source'").run('Other text');
  await expect(persistCompanionHighlightRange({ deviceId: 'fixture', nodeId: saved!.nodeId, range: { from: 0, to: 5 },
    parentContent: body, guard: read.guard, snapshot })).rejects.toThrow('companion_highlight_parent_changed');
  const retained = await loadCompanionWorkspaceNode(saved!.nodeId);
  expect(retained?.anchorLink?.locator).toEqual({ from: 6, to: 10, originalText: 'Beta' });
  expect(retained?.content).toContain('Original note');
});

it('refuses a stale annotation read and invalid ranges without losing a newer note', async () => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const read = await readCompanionHighlight(snapshot, saved!.nodeId);
  await expect(persistCompanionHighlightRange({ deviceId: 'fixture', nodeId: saved!.nodeId, range: { from: 0, to: 99 },
    parentContent: body, guard: read.guard, snapshot })).rejects.toThrow('companion_highlight_range_unavailable');
  await addNoteToCompanionExistingHighlight({ deviceId: 'fixture', nodeId: saved!.nodeId, guard: read.guard,
    note: 'Newer note', originalText: 'Beta', snapshot });
  await expect(persistCompanionHighlightRange({ deviceId: 'fixture', nodeId: saved!.nodeId, range: { from: 0, to: 5 },
    parentContent: body, guard: read.guard, snapshot })).rejects.toThrow('companion_highlight_node_changed');
  expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.content).toContain('Newer note');
});

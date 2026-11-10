// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionReadableArticle, loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { getSelectionCommandPayloadForContentRanges, type SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { addNoteToCompanionExistingHighlight, deleteCompanionExistingHighlight } from './companionExistingHighlightPersistence';
import { HighlightRangeSurface } from './companionHighlightRange.testSupport';
import { persistCompanionHighlightRange } from './companionHighlightRangePersistence';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { createPendingAnnotationActions, useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';

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

it.each(['note', 'cloze'] as const)('adjusts %s through handles and retains the updated content after restart', async kind => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind, payload,
    note: 'Keep this note', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  renderWithLocalization(<HighlightRangeSurface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} cloze={kind === 'cloze'} />);
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

it('holds the displayed range after dismissing handles while the real SQLite write waits for article refresh', async () => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  let finish!: () => void;
  const holdRefresh = new Promise<void>(resolve => { finish = resolve; });
  renderWithLocalization(<HighlightRangeSurface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} holdRefresh={holdRefresh} />);
  const end = await screen.findByRole('button', { name: 'Adjust anchor end' });
  await waitFor(() => expect(end).toBeEnabled());
  act(() => {
    fireEvent.pointerDown(end, { pointerId: 1, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 128, clientY: 90 });
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
  await waitFor(() => expect(JSON.parse(screen.getByTestId('displayed-range').textContent!)[0].to).toBe(16));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('button', { name: 'Adjust anchor end' })).toBeNull();
  expect(JSON.parse(screen.getByTestId('displayed-range').textContent!)[0].to).toBe(16);
  await waitFor(async () => expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.anchorLink?.locator)
    .toEqual({ from: 6, to: 16, originalText: 'Beta Gamma' }));
  await act(async () => { finish(); });
  expect(JSON.parse(screen.getByTestId('displayed-range').textContent!)[0].to).toBe(16);
});

it('retries a failed projection refresh without writing the saved range a second time', async () => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  renderWithLocalization(<HighlightRangeSurface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} refreshFailures={1} />);
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

it.each(['highlight', 'cloze'] as const)('dismisses the %s handles and actions before deletion refresh completes', async kind => {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind, payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  let finish!: () => void;
  const holdRefresh = new Promise<void>(resolve => { finish = resolve; });
  renderWithLocalization(<HighlightRangeSurface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId}
    cloze={kind === 'cloze'} holdRefresh={holdRefresh} />);
  const remove = screen.getByRole('button', { name: kind === 'cloze' ? 'Delete cloze' : 'Close Highlight' });
  await waitFor(() => expect(remove).toBeEnabled());
  expect(screen.getAllByRole('button', { name: /Adjust anchor/ })).toHaveLength(2);
  expect(screen.getByTestId('displayed-range').textContent).toContain(saved!.nodeId);

  try {
    fireEvent.click(remove);
    await waitFor(() => expect(screen.getByTestId('displayed-range')).toHaveTextContent('[]'));
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Adjust anchor/ })).toHaveLength(0);
    await waitFor(async () => expect((await loadCompanionWorkspaceNode(saved!.nodeId))?.deletedAt).toBeTruthy());
  } finally {
    await act(async () => { finish(); });
  }
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(screen.getByTestId('displayed-range')).toHaveTextContent('[]');
});

it.each(['Beta', '中文'])('removes a new highlight for %s without reopening the reader', async word => {
  const content = `Alpha ${word} Gamma`;
  database!.prepare("UPDATE nodes SET content = ? WHERE id = 'source'").run(content);
  const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const readArticle = async () => (await loadCompanionReadableArticle(await snapshot(), 'source'))!;
  const initial = await readArticle();
  expect(initial.content).toBe(content);
  const { result, rerender } = renderHook(({ article }) => useCompanionPendingReadableArticle(article),
    { initialProps: { article: initial } });
  const from = content.indexOf(word);
  const to = from + word.length;
  const selection = getSelectionCommandPayloadForContentRanges('source', content, [{ from, to: to + 1 }])!;
  const actions = createPendingAnnotationActions({
    onCreateSelectionAnnotation: async (kind, payload) => (await persistCompanionSelectionAnnotation({
      deviceId: 'fixture', kind, payload, snapshot: await snapshot()
    }))?.nodeId ?? null,
    onDeleteExistingHighlight: async (nodeId, guard) => (await deleteCompanionExistingHighlight({
      deviceId: 'fixture', nodeId, ...(guard ? { guard } : {}), snapshot: await snapshot()
    }))?.nodeId ?? null
  }, result.current);
  let nodeId = '';
  await act(async () => {
    nodeId = (await actions.createSelectionAnnotation('highlight', selection)) ?? '';
  });
  expect(nodeId).toBeTruthy();
  rerender({ article: await readArticle() });
  expect(result.current.readableArticle.textAnchorDecorations).toContainEqual({ from, to, kind: 'highlight', nodeId });

  const { guard } = await readCompanionHighlight(await snapshot(), nodeId);
  await act(async () => { await actions.deleteExistingHighlight(nodeId, guard); });
  expect((await loadCompanionWorkspaceNode(nodeId))?.deletedAt).toBeTruthy();
  rerender({ article: await readArticle() });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);
});

import '../../test/ambientWorkspaceRefresh.testSupport';

import { unlinkSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { BrowserWindow } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const eligibility = vi.hoisted(() => ({ active: true }));

vi.mock('../../../electron/database/readwiseHostAssignment.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../electron/database/readwiseHostAssignment.js')>(),
  canCurrentHostRunReadwise: () => eligibility.active
}));

import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { loadImportManagerSettings, saveImportManagerSettings } from '../../../electron/import/importManagerSettings.js';
import { cancelReadwiseReaderImport } from '../../../electron/import/readwiseReaderImportRun.js';
import { runReadwiseImportCommand } from '../../../electron/ipc/readwiseImportCommandRun.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract.js';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { invoke, origin } from '../../test/ambientWorkspaceRefresh.testSupport';
import { resetImportSourceWorkspaceSettingsCacheForTest } from '../components/importSourceWorkspaceSettings';

import { refreshWorkspaceAfterReadwiseImport } from './readwiseWorkspaceRefresh';
import { useReadwiseAutoSync } from './useReadwiseAutoSync';
import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

let sourceRoot = '';
let scheduled: (() => void) | undefined;
let scheduleCount = 0;
let completed: NativeReadwiseImportRunResult | undefined;
const sourceBytes = '\ufeff## Metadata\r\n- Author: [[Ada]]\r\n\r\n## Full Document\r\nBody before exact quote after.\r\n';

beforeEach(async () => {
  // Align jsdom DOMException with the native host Error realm for real cancellation.
  eligibility.active = true;
  const NativeError = Error;
  vi.stubGlobal('DOMException', class extends NativeError {
    constructor(message: string, name: string) { super(message); this.name = name; }
  });
  await fs.mkdir('.tmp/artifacts/T627', { recursive: true });
  sourceRoot = await fs.mkdtemp(path.resolve('.tmp/artifacts/T627/relay-'));
  const primary = path.join(sourceRoot, 'Full Document Contents', 'Articles');
  const highlights = path.join(sourceRoot, 'Articles');
  await fs.mkdir(primary, { recursive: true });
  await fs.mkdir(highlights, { recursive: true });
  await fs.writeFile(path.join(primary, 'Scoped Article.md'), sourceBytes);
  await fs.writeFile(path.join(highlights, 'Scoped Article.md'), '# Scoped Article\n\n## Highlights\nexact quote\n');
  const defaults = createDefaultImportManagerSettings();
  saveImportManagerSettings({ ...defaults, readwiseRootPath: sourceRoot,
    readwiseReaderConfig: { ...defaults.readwiseReaderConfig, enabled: true,
      importScope: 'all', validatedAt: '2026-10-01T00:00:00Z' },
    readwiseSources: [{ id: path.basename(sourceRoot), kind: 'articles', keepState: 'enabled',
      primaryPath: primary, highlightPath: highlights, keepPreview: null, highlightMode: 'split' }]
  });
  Object.defineProperty(BrowserWindow, 'fromWebContents', { configurable: true,
    value: (sender: unknown) => BrowserWindow.getAllWindows().find(window => window.webContents === sender) });
  invoke.mockImplementation(async (command, args = {}) => {
    if (command === 'run_readwise_reader_import') {
      const result = await runReadwiseImportCommand({ ...args, window: origin }, origin as never);
      completed = result as NativeReadwiseImportRunResult;
      return result;
    }
    return handleStorageCommand(command, args, origin as never);
  });
  resetImportSourceWorkspaceSettingsCacheForTest();
  scheduled = undefined;
  scheduleCount = 0;
  completed = undefined;
  origin.webContents.send.mockReset();
  const realTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
    if (typeof handler === 'function' && delay === 3_600_000) {
      scheduled = handler as () => void;
      scheduleCount++;
      return 10_000_000 as unknown as ReturnType<typeof window.setTimeout>;
    }
    return realTimeout(handler, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  origin.webContents.send.mockReset();
  await fs.rm(sourceRoot, { recursive: true, force: true });
});

async function runScheduled() {
  const before = scheduleCount;
  await act(async () => { scheduled?.(); });
  await act(async () => {
    await vi.waitFor(() => expect(scheduleCount).toBe(before + 1));
  });
  expect(completed).toBeTruthy();
}

it('refreshes a real relay import from its committed root through the existing automatic hook', async () => {
  const current = useWorkspaceStore.getState().activeNodeId;
  const view = renderHook(() => useReadwiseAutoSync());
  await vi.waitFor(() => expect(scheduleCount).toBe(1));
  await runScheduled();
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE title=?', ['Scoped Article']);
  expect(row).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Scoped Article');
  expect(useWorkspaceStore.getState().activeNodeId).toBe(current);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_projection')).toHaveLength(1);
  expect(await fs.readFile(path.join(sourceRoot, 'Full Document Contents', 'Articles', 'Scoped Article.md'), 'utf8')).toBe(sourceBytes);
  view.unmount();
});

it('shows a committed file after cancellation before the batch returns its entries', async () => {
  origin.webContents.send.mockImplementation((channel, payload) => {
    if (channel === 'foliole:readwise-reader-import-progress' && payload.phase === 'writing'
      && payload.highlightProcessedCount === 1) cancelReadwiseReaderImport();
  });
  const view = renderHook(() => useReadwiseAutoSync());
  await vi.waitFor(() => expect(scheduleCount).toBe(1));
  await runScheduled();
  expect(completed).toMatchObject({ imported_count: 0, status: 'cancelled' });
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE title=?', ['Scoped Article']);
  expect(row).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Scoped Article');
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  view.unmount();
});

it('keeps external-only imports and an unchanged retry out of workspace reads', async () => {
  const settings = loadImportManagerSettings();
  saveImportManagerSettings({ ...settings, readwiseAutoImportPolicy: {
    ...settings.readwiseAutoImportPolicy, articleWithHighlights: 'external'
  } });
  const view = renderHook(() => useReadwiseAutoSync());
  await vi.waitFor(() => expect(scheduleCount).toBe(1));
  await runScheduled();
  expect(completed).toMatchObject({ imported_count: 1, workspace_scope: { kind: 'nodes', nodeIds: [] } });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM external_documents WHERE is_present=1')).toEqual({ count: 1 });
  await runScheduled();
  expect(invoke.mock.calls.filter(([name]) => name.startsWith('load_workspace_list'))).toHaveLength(0);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  view.unmount();
});

it('preserves the manual helper and ignores a late receipt from a different library', async () => {
  const result = await invoke('run_readwise_reader_import') as NativeReadwiseImportRunResult;
  await refreshWorkspaceAfterReadwiseImport({ ...result, library_scope: 'retired-library' });
  expect(invoke.mock.calls.filter(([name]) => name.startsWith('load_workspace_list'))).toHaveLength(0);
  await refreshWorkspaceAfterReadwiseImport(result);
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE title=?', ['Scoped Article']);
  expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Scoped Article');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  invoke.mockClear();
  const legacy = { ...result };
  delete legacy.workspace_scope;
  delete legacy.library_scope;
  await refreshWorkspaceAfterReadwiseImport(legacy);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(1);
});

it('publishes committed results after terminal failure and keeps the next scheduled retry working', async () => {
  const settings = loadImportManagerSettings();
  const source = settings.readwiseSources[0]!;
  saveImportManagerSettings({ ...settings, readwiseSources: [source, { ...source,
    id: `${source.id}-next`, kind: 'tweets', primaryPath: path.join(sourceRoot, 'Missing'),
    highlightPath: path.join(sourceRoot, 'Missing Highlights')
  }] });
  origin.webContents.send.mockImplementation((channel, payload) => {
    if (channel === 'foliole:readwise-reader-import-progress' && payload.processedCount === 1) {
      eligibility.active = false;
    }
  });
  const view = renderHook(() => { useReadwiseAutoSync(); useWorkspaceContentChangedRefresh(); });
  await vi.waitFor(() => expect(scheduleCount).toBe(1));
  await act(async () => { scheduled?.(); });
  await vi.waitFor(() => expect(scheduleCount).toBe(2));
  expect(completed).toBeUndefined();
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE title=?', ['Scoped Article']);
  expect(row).toBeTruthy();
  await act(async () => {
    await vi.waitFor(() => expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Scoped Article'), { timeout: 5_000 });
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  eligibility.active = true;
  origin.webContents.send.mockReset();
  await runScheduled();
  expect(completed).toMatchObject({ status: 'completed', imported_count: 0 });
  view.unmount();
});

it('keeps the earlier committed scope when a later file disappears during source reads', async () => {
  const primary = path.join(sourceRoot, 'Full Document Contents', 'Articles', 'ZZ Later.md');
  await fs.writeFile(primary, sourceBytes);
  await fs.writeFile(path.join(sourceRoot, 'Articles', 'ZZ Later.md'), '# ZZ Later\n\n## Highlights\nexact quote\n');
  origin.webContents.send.mockImplementation((channel, payload) => {
    if (channel === 'foliole:readwise-reader-import-progress' && payload.phase === 'source_completed'
      && payload.sourceProcessedCount === 1) unlinkSync(primary);
  });
  const view = renderHook(() => useReadwiseAutoSync());
  await vi.waitFor(() => expect(scheduleCount).toBe(1));
  await runScheduled();
  expect(completed).toMatchObject({ imported_count: 1, skipped_count: 1, workspace_scope: { kind: 'nodes' } });
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE title=?', ['Scoped Article']);
  expect(row).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Scoped Article');
  view.unmount();
});

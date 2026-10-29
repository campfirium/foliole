import '../../test/ambientWorkspaceRefresh.testSupport';

import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const eligibility = vi.hoisted(() => ({ active: true }));

vi.mock('../../../electron/database/readwiseHostAssignment.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../electron/database/readwiseHostAssignment.js')>(),
  canCurrentHostRunReadwise: () => eligibility.active,
  loadReadwiseHostAssignment: () => ({ is_active: true, current_host_name: 'desktop-test' })
}));
vi.mock('../../../electron/database/readwiseRemoteIdentity.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../electron/database/readwiseRemoteIdentity.js')>(),
  loadReadwiseRemoteSource: () => ({ connectionRef: 'connection', version: 1 })
}));
vi.mock('../../../electron/import/readwiseApiConnectionState.js', () => ({
  isStoredReadwiseApiConnectionReady: () => true,
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin', state: 'connected' },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('../../../electron/database/readwiseSourceMode.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../electron/database/readwiseSourceMode.js')>(),
  loadReadwiseSourceModeState: () => ({ mode: 'api', conflictReasons: [], completion: null })
}));
vi.mock('../../../electron/import/readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { writeReadwiseSourceCutover } from '../../../electron/database/readwiseSourceCutover.js';
import { saveJsonSetting } from '../../../electron/database/settingsStore.js';
import { saveImportManagerSettings } from '../../../electron/import/importManagerSettings.js';
import { cancelReadwiseApiImport } from '../../../electron/import/readwiseApiImportRun.js';
import { apiSettings, exportBook, readerDocument, response } from '../../../electron/import/readwiseApiImportRun.testSupport.js';
import { loadReadwiseApiScheduleStatus, startReadwiseApiScheduler, stopReadwiseApiScheduler } from '../../../electron/import/readwiseApiScheduler.js';
import { normalizeReaderDocument } from '../../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../../lib/core/readwise/readwiseApiImport.js';
import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION } from '../../../lib/core/readwise/readwiseSourceCutover.js';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { invoke, origin } from '../../test/ambientWorkspaceRefresh.testSupport';

import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

vi.setConfig({ testTimeout: 45_000 });

afterEach(() => { stopReadwiseApiScheduler(); origin.webContents.send.mockReset(); vi.unstubAllGlobals(); });

async function runBackgroundImport(destination: 'external' | 'inbox', afterCommit?: () => void,
  prepare?: () => void, highlights = false) {
  eligibility.active = true;
  origin.webContents.send.mockReset();
  if (afterCommit) origin.webContents.send.mockImplementation((channel, payload) => {
    if (channel === 'foliole:readwise-reader-import-progress' && payload.phase === 'writing'
      && payload.processedCount === 1) afterCommit();
  });
  const settings = apiSettings('off');
  saveImportManagerSettings({ ...settings,
    readwiseAutoImportPolicy: { ...settings.readwiseAutoImportPolicy, articleWithoutHighlights: destination }
  });
  saveJsonSetting('readwise_source_mode', { mode: 'api', version: 1 });
  prepare?.();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const category = url.searchParams.get('category');
    const id = url.searchParams.get('id');
    if (highlights && url.pathname.includes('/v2/export/')) return response([exportBook('background-article', 'annotation-one', 'articles')]);
    if (highlights && category === 'highlight') return response([{ category: 'highlight', id: 'annotation-one', parent_id: 'background-article' }]);
    return response(category === 'article' || id === 'background-article'
      ? [readerDocument('background-article', 'article')] : []);
  }));
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  await act(async () => {
    await startReadwiseApiScheduler();
    expect(loadReadwiseApiScheduleStatus().eligibility).toBe('ready');
    await vi.waitFor(() => expect(loadReadwiseApiScheduleStatus().routine_sync.last_result).toBeTruthy(), { timeout: 30_000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
  });
  expect(fetch).toHaveBeenCalled();
  expect(loadReadwiseApiScheduleStatus().routine_sync.last_result).toBeTruthy();
  stopReadwiseApiScheduler();
  return view;
}

it('publishes a real scheduled API import through preload and reads only the imported subtree', async () => {
  const unrelated = useWorkspaceStore.getState().nodesById.other;
  const view = await runBackgroundImport('inbox');
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    "SELECT n.id FROM nodes n JOIN import_sources s ON s.latest_node_id=n.id WHERE s.remote_document_id=?", ['background-article']);
  expect(row).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[row!.id]?.title).toBe('Title background-article');
  expect(useWorkspaceStore.getState().nodesById.other).toBe(unrelated);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_projection')).toHaveLength(1);
  view.unmount();
});

it('retains auxiliary completion notifications without reading workspace nodes for an external-only import', async () => {
  const before = useWorkspaceStore.getState();
  const view = await runBackgroundImport('external');
  expect(origin.webContents.send).toHaveBeenCalledWith('foliole:workspace-content-changed', expect.any(Object));
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM external_documents WHERE reference_kind = 'readwise_remote'")?.count).toBe(1);
  expect(invoke.mock.calls.filter(([name]) => name.startsWith('load_workspace_list'))).toHaveLength(0);
  expect(useWorkspaceStore.getState()).toBe(before);
  view.unmount();
});

it.each(['cancel', 'failure'] as const)('publishes a committed import when the terminal outcome is %s', async outcome => {
  const view = await runBackgroundImport('inbox', () => {
    if (outcome === 'cancel') cancelReadwiseApiImport();
    else eligibility.active = false;
  });
  expect(loadReadwiseApiScheduleStatus().routine_sync.last_result).toMatchObject({
    imported_count: 0, status: outcome === 'cancel' ? 'cancelled' : 'failed'
  });
  const row = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id=?", ['background-article']);
  expect(useWorkspaceStore.getState().nodesById[row!.latest_node_id]?.title).toBe('Title background-article');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  view.unmount();
});

it('retains the full refresh for a separately committed recovery batch before a local routine result', async () => {
  const view = await runBackgroundImport('inbox', undefined, () => {
    const document = prepareReadwiseApiDocuments([normalizeReaderDocument(readerDocument('recovered', 'article'))!], [])[0]!;
    writeReadwiseSourceCutover({ annotations: [], cohortDocumentIds: ['recovered'], completedAt: '2026-10-01',
      completionVersion: READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
      documents: [{ nodeId: null, remoteId: 'recovered', status: 'blocked', reason: 'request_failed' }], retiredNodeIds: [],
      sourceHost: 'desktop-test', startedAt: '2026-10-01', status: 'api',
      failures: [{ reason: 'request_failed', remoteId: 'recovered', stage: 'writing', title: document.title }] });
    saveJsonSetting('readwise_source_cutover_failed_facts', { connectionRef: 'connection', documents: [document],
      work: { config: apiSettings().readwiseReaderConfig,
        items: [{ binding: null, destination: 'inbox', remoteId: 'recovered' }] } });
  });
  const source = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    'SELECT latest_node_id FROM import_sources WHERE remote_document_id=?', ['recovered']);
  expect(useWorkspaceStore.getState().nodesById[source!.latest_node_id]?.title).toBe('Title recovered');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot').length).toBeGreaterThan(0);
  view.unmount();
});

it('loads the committed annotation identity, anchor and ordering through the imported root scope', async () => {
  const view = await runBackgroundImport('inbox', undefined, undefined, true);
  const row = openDatabaseConnection().driver.queryOne<{ id: string; parent_id: string; anchor_link: string }>(
    "SELECT child.id,child.parent_id,child.anchor_link FROM nodes child JOIN import_sources s ON s.latest_node_id=child.parent_id WHERE s.remote_document_id=? AND child.deleted_at IS NULL", ['background-article']);
  expect(row).toBeTruthy();
  const state = useWorkspaceStore.getState();
  expect(state.nodesById[row!.id]).toBeTruthy();
  expect(await invoke('load_node_document', { nodeId: row!.id })).toMatchObject({ content: 'Body background-article' });
  expect(state.nodesById[row!.id]?.parentNodeId).toBe(row!.parent_id);
  expect(state.nodesById[row!.id]?.anchorLink?.locator).toEqual(JSON.parse(row!.anchor_link).locator);
  expect(state.nodeOrder.indexOf(row!.id)).toBeGreaterThan(state.nodeOrder.indexOf(row!.parent_id));
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  view.unmount();
});

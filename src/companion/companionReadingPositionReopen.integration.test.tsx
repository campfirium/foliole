// @vitest-environment jsdom
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionViewStateSync } from './useCompanionViewStateSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

type SyncState = Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>>;
let directory: string;
let database: Database.Database | null;
let refresh: (() => Promise<unknown>) | null = null;

async function openLibrary() {
  const path = join(directory, 'library.db');
  const existed = existsSync(path);
  const sqlite = new Database(path);
  database = sqlite;
  await initializeIosCompanionDatabase({
    booted_at: '2026-11-20T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Reading position reopen fixture', runtime_kind: 'android-capacitor'
  }, createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; }));
}

beforeEach(async () => {
  const artifacts = join(process.cwd(), '.tmp/artifacts');
  mkdirSync(artifacts, { recursive: true });
  directory = mkdtempSync(join(artifacts, 'reading-position-reopen-'));
  await openLibrary();
  database!.prepare(`INSERT INTO nodes (id, title, kind, content, created_at, updated_at)
    VALUES ('source', 'Source', 'topic', ?, '2026-11-20', '2026-11-20')`).run('Long article body.');
});

afterEach(async () => {
  cleanup();
  refresh = null;
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(directory, { recursive: true, force: true });
});

// The shell path: the production article loader feeds the reader, and its scroll-save hook
// persists the position and flushes it when the reader exits.
function Reader({ initial, onState }: { initial: SyncState; onState(state: SyncState): void }) {
  const [state, setState] = useState(initial);
  const [, setLoadedArticle] = useState<CompanionReadableArticle | null>(null);
  const { openReadableArticle, readableArticle: article } =
    useCompanionReadableArticleLoader(state.workspace_snapshot, setLoadedArticle);
  const saveScroll = useCompanionViewStateSync({ activeAction: 'recent', readableArticleNodeId: 'source',
    reviewNodeId: null, selectedBrowseNodeId: null });
  useEffect(() => {
    onState(state);
    void openReadableArticle('source');
  }, [onState, openReadableArticle, state]);
  refresh = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} }).refreshAfterMutation;
  if (!article) return null;
  return <MouseGestureSettingsProvider><CompanionDraftProvider>
    <output data-testid="saved-scroll-top">{article.persistedNodeViewState?.scrollTop ?? 0}</output>
    <ImmersiveReadableArticle onExit={() => {}} snapshot={state.workspace_snapshot} readableArticle={article}
      onScrollTopChange={saveScroll} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
}

async function open(initial: SyncState) {
  let latest = initial;
  const view = renderWithLocalization(<Reader initial={initial} onState={state => { latest = state; }} />);
  await screen.findByTestId('saved-scroll-top');
  const surface = view.container.querySelector<HTMLElement>('[data-companion-reading-surface]')!;
  return { view, surface, latest: () => latest };
}

function savedScrollTop() {
  return (database!.prepare("SELECT scroll_top FROM node_view_state WHERE node_id = 'source'").get() as
    { scroll_top: number } | undefined)?.scroll_top;
}

async function readAndExit(reader: Awaited<ReturnType<typeof open>>, scrollTop: number) {
  fireEvent.touchStart(reader.surface);
  reader.surface.scrollTop = scrollTop;
  fireEvent.scroll(reader.surface);
  const stale = reader.latest();
  reader.view.unmount();
  await waitFor(async () => {
    await runCompanionSyncWriterTask(async () => undefined);
    expect(savedScrollTop()).toBe(scrollTop);
  });
  return stale;
}

it('reopens each time at the position saved on exit when the snapshot catches up after opening', async () => {
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: 2392 });
  let reader = await open(await loadCompanionWorkspaceSyncState());
  expect(reader.surface.scrollTop).toBe(2392);
  for (const exitTop of [3564, 1775]) {
    // Exiting saves the position to SQLite; the in-memory snapshot still holds the previous one.
    const stale = await readAndExit(reader, exitTop);
    reader = await open(stale);
    await act(async () => { await refresh!(); });
    await waitFor(() => expect(screen.getByTestId('saved-scroll-top')).toHaveTextContent(String(exitTop)));
    expect(reader.surface.scrollTop).toBe(exitTop);
  }

  // Once the reader acts, a later refresh with an older saved position leaves the article alone.
  fireEvent.touchStart(reader.surface);
  reader.surface.scrollTop = 4100;
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: 1200 });
  await act(async () => { await refresh!(); });
  await waitFor(() => expect(screen.getByTestId('saved-scroll-top')).toHaveTextContent('1200'));
  expect(reader.surface.scrollTop).toBe(4100);
});

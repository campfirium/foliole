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
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';
import { loadCompanionReadableArticle, loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

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

// Mirrors the shell: the article carries the saved position held by the current workspace snapshot.
function Reader({ initial, onState }: { initial: SyncState; onState(state: SyncState): void }) {
  const [state, setState] = useState(initial);
  const [article, setArticle] = useState<Awaited<ReturnType<typeof loadCompanionReadableArticle>>>(null);
  useEffect(() => {
    onState(state);
    void loadCompanionReadableArticle(state.workspace_snapshot, 'source').then(setArticle);
  }, [onState, state]);
  refresh = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} }).refreshAfterMutation;
  if (!article) return null;
  return <MouseGestureSettingsProvider><CompanionDraftProvider>
    <output data-testid="saved-scroll-top">{article.persistedNodeViewState?.scrollTop ?? 0}</output>
    <ImmersiveReadableArticle onExit={() => {}} snapshot={state.workspace_snapshot} readableArticle={article} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
}

async function open(initial: SyncState) {
  let latest = initial;
  const view = renderWithLocalization(<Reader initial={initial} onState={state => { latest = state; }} />);
  await screen.findByTestId('saved-scroll-top');
  const surface = view.container.querySelector<HTMLElement>('[data-companion-reading-surface]')!;
  return { view, surface, latest: () => latest };
}

it('reopens at the position saved on exit even when the workspace snapshot catches up after opening', async () => {
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: 2392 });
  const first = await open(await loadCompanionWorkspaceSyncState());
  expect(first.surface.scrollTop).toBe(2392);
  // The reader moves on, and exiting saves the new position without refreshing the snapshot.
  fireEvent.touchStart(first.surface);
  first.surface.scrollTop = 3564;
  fireEvent.scroll(first.surface);
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: 3564 });
  const stale = first.latest();
  first.view.unmount();

  const reopened = await open(stale);
  expect(screen.getByTestId('saved-scroll-top')).toHaveTextContent('2392');
  await act(async () => { await refresh!(); });
  await waitFor(() => expect(screen.getByTestId('saved-scroll-top')).toHaveTextContent('3564'));
  expect(reopened.surface.scrollTop).toBe(3564);

  // Once the reader acts, a later refresh with an older saved position leaves the article alone.
  fireEvent.touchStart(reopened.surface);
  reopened.surface.scrollTop = 4100;
  await saveCompanionSyncNodeViewState({ nodeId: 'source', scrollTop: 1200 });
  await act(async () => { await refresh!(); });
  await waitFor(() => expect(screen.getByTestId('saved-scroll-top')).toHaveTextContent('1200'));
  expect(reopened.surface.scrollTop).toBe(4100);
});

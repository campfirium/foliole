import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderHook } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useState, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { CompanionNavigationProvider, useCompanionNavigationField } from '../companion/CompanionNavigationProvider';
import { useCompanionArticleSurface } from '../companion/useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from '../companion/useCompanionArticleSurfaceTestSupport';
import { useCompanionBrowseSortState } from '../companion/useCompanionBrowseSortState';
import { useCompanionDirectorySelectionState } from '../companion/useCompanionDirectorySelectionState';
import { useCompanionReadableArticleLoader } from '../companion/useCompanionReadableArticleLoader';
import { useCompanionSearchNavigation } from '../companion/useCompanionSearchNavigation';
import { useCompanionShellActions } from '../companion/useCompanionShellActions';
import { useCompanionSyncSettingsPage } from '../companion/useCompanionSyncSettingsPage';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

export async function createResumeLibrary() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-resume-'));
  let database: Database.Database;
  async function open() {
    const file = path.join(root, 'companion.db');
    const existed = existsSync(file);
    database = new Database(file);
    await initializeIosCompanionDatabase({
      booted_at: '2026-10-25T00:00:00Z', database_path: null, database_ready: false,
      host_name: 'Resume library', runtime_kind: 'android-capacitor'
    }, createFakeCapacitorDatabaseManager(database, existed, () => {}));
  }
  await open();
  const insert = database!.prepare('INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const now = '2026-10-25T00:00:00Z';
  insert.run('folder', null, 'Folder', 'folder', '', now, now);
  insert.run('article', 'folder', 'Article', 'topic', '# Article\n\nRead here', now, now);
  return {
    get database() { return database; },
    snapshot: async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!,
    reopen: async () => {
      await runCompanionSyncWriterTask(async () => undefined);
      await closeIosCompanionDatabase();
      await open();
      return (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    },
    close: async () => {
      await runCompanionSyncWriterTask(async () => undefined);
      await closeIosCompanionDatabase();
      rmSync(root, { recursive: true, force: true });
    }
  };
}

export function renderResumeSurface(snapshot: WorkspaceSnapshot, ready = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocalizationProvider initialLanguagePreference="en"><CompanionNavigationProvider ready={ready} snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
      {children}
    </CompanionNavigationProvider></LocalizationProvider>
  );
  return renderHook(() => {
    const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
    const loader = useCompanionReadableArticleLoader(snapshot, setReadableArticle);
    const sort = useCompanionBrowseSortState();
    const workspaceSync = { ...createWorkspaceSync(snapshot), ...loader, readableArticle };
    const surface = useCompanionArticleSurface(workspaceSync, createFloatingBar(), {
      sortKey: sort.browseSortKey, sortDirection: sort.browseSortDirection
    });
    const [directoryOpen, setDirectoryOpen] = useCompanionNavigationField('isBrowseDirectoryOpen', false);
    const directory = useCompanionDirectorySelectionState(directoryOpen);
    const settings = useCompanionSyncSettingsPage({ activeAction: surface.activeAction, syncOnboardingStatus: 'completed' });
    const search = useCompanionSearchNavigation(surface);
    const [onlyReviewOpen, setOnlyReviewOpen] = useCompanionNavigationField('isOnlyReviewOpen', false);
    const actions = useCompanionShellActions({ ...sort, ...settings, directoryState: directory,
      externalDirectory: { entries: [], folders: [] }, isBrowseDirectoryOpen: directoryOpen,
      isOnlyReviewOpen: onlyReviewOpen, setIsBrowseDirectoryOpen: setDirectoryOpen,
      setIsOnlyReviewOpen: setOnlyReviewOpen, setIsCaptureSheetOpen: () => {}, surface, workspaceSync });
    return { surface, directory, directoryOpen, setDirectoryOpen, settings, search, sort, actions };
  }, { wrapper });
}

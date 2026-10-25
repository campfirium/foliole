// @vitest-environment jsdom
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { saveCompanionSyncNodeOpenState } from '../shared/platform/companionSyncObjects';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { initialCompanionNavigation } from './companionNavigationState';

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => {
  library = await createResumeLibrary();
  library.database.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES ('new', 'folder', 'New topic', 'topic', 'Body', '2026-10-25T01:00:00Z', '2026-10-25T01:00:00Z')`).run();
  await saveCompanionSyncNodeOpenState({ nodeId: 'article', lastOpenedAt: '2026-10-25T02:00:00Z' });
});
afterEach(async () => { cleanup(); await library.close(); });

async function openBrowse() {
  const ui = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  return ui;
}

function topicOrder(ui: Awaited<ReturnType<typeof openBrowse>>) {
  return ui.result.current.surface.recentArticles.map(topic => topic.nodeId);
}

it('enters Browse unchanged, then alternates actual topic order and visible sort feedback', async () => {
  const ui = await openBrowse();
  expect(topicOrder(ui)).toEqual(['new', 'article']);
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(ui)).toEqual(['article', 'new']);
  expect(ui.result.current.actions.topBarProps).toMatchObject({ subtitle: 'Last opened' });
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(ui)).toEqual(['new', 'article']);
  expect(ui.result.current.actions.topBarProps).toMatchObject({ subtitle: 'Date modified' });
});

it('persists the selected order through a real database close and reopen', async () => {
  const ui = await openBrowse();
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  ui.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current).not.toBeNull());
  expect(topicOrder(reopened)).toEqual(['article', 'new']);
  expect(reopened.result.current.sort).toMatchObject({ browseSortKey: 'dateLastOpened', browseSortDirection: 'desc' });
  const saved = JSON.parse((await loadCompanionNavigationResume((await library.snapshot()).libraryScope!))!);
  expect(saved).toMatchObject({ browseSortKey: 'dateLastOpened', browseSortDirection: 'desc' });
  act(() => reopened.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(reopened)).toEqual(['new', 'article']);
});

it('returns from a topic, folder or directory before interpreting a tap as a sort change', async () => {
  const ui = await openBrowse();
  for (const nodeId of ['article', 'folder']) {
    act(() => ui.result.current.surface.handleSelectBrowseNode(nodeId));
    act(() => ui.result.current.actions.handleNavigationAction('recent'));
    expect(ui.result.current.surface.selectedBrowseNodeId).toBeNull();
    expect(ui.result.current.sort.browseSortKey).toBe('dateSaved');
  }
  act(() => ui.result.current.actions.secondaryDestinations.handleSecondaryDestination('directory'));
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(ui.result.current.directoryOpen).toBe(false);
  expect(ui.result.current.sort.browseSortKey).toBe('dateSaved');
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(ui.result.current.sort.browseSortKey).toBe('dateLastOpened');
});

it('keeps the chosen sort when switching tabs and resumes the two-mode shortcut from a menu choice', async () => {
  const ui = await openBrowse();
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  act(() => ui.result.current.actions.handleNavigationAction('search'));
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(ui.result.current.sort.browseSortKey).toBe('dateLastOpened');
  act(() => ui.result.current.sort.setBrowseSortKey('name'));
  act(() => ui.result.current.sort.setBrowseSortDirection('asc'));
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(ui.result.current.sort).toMatchObject({ browseSortKey: 'dateLastOpened', browseSortDirection: 'desc' });
});

it('hydrates older navigation without sorting fields and isolates another library', async () => {
  const snapshot = await library.snapshot();
  const older: Partial<ReturnType<typeof initialCompanionNavigation>> = initialCompanionNavigation(true);
  delete older.browseSortKey;
  delete older.browseSortDirection;
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...older, activeAction: 'recent' }));
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  expect(topicOrder(ui)).toEqual(['new', 'article']);
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  ui.unmount();
  const other = renderResumeSurface({ ...snapshot, libraryScope: 'Other library' });
  await waitFor(() => expect(other.result.current).not.toBeNull());
  expect(other.result.current.sort.browseSortKey).toBe('dateSaved');
});

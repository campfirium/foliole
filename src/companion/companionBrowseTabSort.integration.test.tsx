// @vitest-environment jsdom
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { resetCompanionFolderListSortMemoryForTests } from '../shared/platform/companion/settings/companionFolderListSortMemoryStore';
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
afterEach(async () => { cleanup(); await library.close(); resetCompanionFolderListSortMemoryForTests(); });

function phoneSortRows() {
  return library.database.prepare(`SELECT scope, platform, form_factor, host_name, value_json FROM setting_records
    WHERE key = 'folder_list_sort_memory'`).all() as { form_factor: string; host_name: string; platform: string; scope: string; value_json: string }[];
}

function savedSorts() {
  const [row] = phoneSortRows();
  return row ? (JSON.parse(row.value_json) as { sortByListId: Record<string, unknown> }).sortByListId : {};
}

async function openBrowse() {
  const ui = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  return ui;
}

function topicOrder(ui: Awaited<ReturnType<typeof openBrowse>>) {
  return ui.result.current.surface.recentArticles.map(topic => topic.nodeId);
}

it('enters Browse unchanged, then alternates actual topic order', async () => {
  const ui = await openBrowse();
  expect(topicOrder(ui)).toEqual(['new', 'article']);
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(ui)).toEqual(['article', 'new']);
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(ui)).toEqual(['new', 'article']);
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

it('keeps the home order through a real database close and reopen, outside navigation', async () => {
  const ui = await openBrowse();
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  await waitFor(() => expect(savedSorts()).toEqual({ 'special-home': { direction: 'desc', key: 'dateLastOpened' } }));
  ui.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current).not.toBeNull());
  expect(topicOrder(reopened)).toEqual(['article', 'new']);
  expect(reopened.result.current.sort).toMatchObject({ browseSortKey: 'dateLastOpened', browseSortDirection: 'desc' });
  act(() => reopened.result.current.actions.handleNavigationAction('recent'));
  expect(topicOrder(reopened)).toEqual(['new', 'article']);
  expect(reopened.result.current.sort).toMatchObject({ browseSortKey: 'dateSaved', browseSortDirection: 'desc' });
  await waitFor(() => expect(savedSorts()).toEqual({}));
  const saved = JSON.parse((await loadCompanionNavigationResume((await library.snapshot()).libraryScope!))!);
  expect(saved).not.toHaveProperty('browseSortKey');
  expect(saved).not.toHaveProperty('browseSortDirection');
});

it('writes the choices as one phone setting of the library', async () => {
  const ui = await openBrowse();
  act(() => ui.result.current.actions.handleNavigationAction('recent'));
  await waitFor(() => expect(phoneSortRows()).toHaveLength(1));
  expect(phoneSortRows()[0]).toMatchObject({ scope: 'user_space', form_factor: 'phone', host_name: '*', platform: 'android' });
});

it('keeps a folder order to that folder, apart from home and other folders', async () => {
  const now = '2026-10-25T00:00:00Z';
  const insert = library.database.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insert.run('other', null, 'Other', 'folder', '', now, now);
  insert.run('other-topic', 'other', 'Other topic', 'topic', 'Body', now, now);
  const ui = await openBrowse();
  act(() => ui.result.current.setDirectoryOpen(true));
  act(() => ui.result.current.directory.setDirectorySelection({ kind: 'internal', nodeId: 'folder' }));
  act(() => ui.result.current.sort.setBrowseSortKey('name'));
  act(() => ui.result.current.sort.setBrowseSortDirection('asc'));
  expect(ui.result.current.sort).toMatchObject({ browseSortKey: 'name', browseSortDirection: 'asc' });
  act(() => ui.result.current.directory.setDirectorySelection({ kind: 'internal', nodeId: 'other' }));
  expect(ui.result.current.sort).toMatchObject({ browseSortKey: 'dateSaved', browseSortDirection: 'desc' });
  act(() => ui.result.current.directory.setDirectorySelection({ kind: 'trash' }));
  expect(ui.result.current.sort.browseSortKey).toBe('dateSaved');
  act(() => ui.result.current.setDirectoryOpen(false));
  expect(ui.result.current.sort).toMatchObject({ browseSortKey: 'dateSaved', browseSortDirection: 'desc' });
  act(() => ui.result.current.surface.handleSelectBrowseNode('folder'));
  expect(ui.result.current.sort).toMatchObject({ browseSortKey: 'name', browseSortDirection: 'asc' });
  expect(ui.result.current.surface.browsedFolder?.items.map(item => item.nodeId)).toEqual(['article', 'new']);
  act(() => ui.result.current.surface.handleSelectBrowseNode('article'));
  expect(ui.result.current.sort.browseSortKey).toBe('name');
  await waitFor(() => expect(savedSorts()).toEqual({ folder: { direction: 'asc', key: 'name' } }));
  act(() => ui.result.current.surface.handleSelectBrowseNode('folder'));
  act(() => ui.result.current.sort.setBrowseSortKey('dateSaved'));
  await waitFor(() => expect(savedSorts()).toEqual({}));
});

it('moves an older single Browse sort to home once and keeps another library apart', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...initialCompanionNavigation(true),
    activeAction: 'recent', browseSortKey: 'dateLastOpened', browseSortDirection: 'desc' }));
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  expect(topicOrder(ui)).toEqual(['article', 'new']);
  expect(savedSorts()).toEqual({ 'special-home': { direction: 'desc', key: 'dateLastOpened' } });
  act(() => ui.result.current.surface.handleSelectBrowseNode('folder'));
  expect(ui.result.current.sort.browseSortKey).toBe('dateSaved');
  await waitFor(async () => expect(JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!))
    .not.toHaveProperty('browseSortKey'));
  ui.unmount();
  await library.close();
  library = await createResumeLibrary();
  const other = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(other.result.current).not.toBeNull());
  act(() => other.result.current.actions.handleNavigationAction('recent'));
  expect(other.result.current.sort.browseSortKey).toBe('dateSaved');
  expect(phoneSortRows()).toEqual([]);
});

it('leaves home on its default when older navigation held the default or no sort', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...initialCompanionNavigation(true),
    activeAction: 'recent', browseSortKey: 'dateSaved', browseSortDirection: 'desc' }));
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  expect(topicOrder(ui)).toEqual(['new', 'article']);
  expect(phoneSortRows()).toEqual([]);
});

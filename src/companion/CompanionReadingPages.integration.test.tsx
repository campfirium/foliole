import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({ ...createCompanionNativeSyncStub(), stopSyncGroupProvider: async () => {}, addListener: async () => ({ remove: async () => {} }) }) };
});

import { saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import * as browseApi from '../shared/platform/companionBrowseLists';
import * as externalApi from '../shared/platform/companionExternalDocuments';
import * as searchApi from '../shared/platform/companionFullTextSearch';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { initialCompanionNavigation } from './companionNavigationState';
import { installReadingRangeGeometry, ReadingLibraryShell } from './companionReadingPages.testSupport';

let restoreRange: () => void;
beforeAll(() => { restoreRange = installReadingRangeGeometry(); });
afterAll(() => restoreRange());
let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => {
  library = await createResumeLibrary();
  await saveCompanionNavigationResume((await library.snapshot()).libraryScope!,
    JSON.stringify({ ...initialCompanionNavigation(true), activeAction: 'recent' }));
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

it.each([30, 180])('returns to the same list and independent reading position with %i extra rows', async count => {
  const insert = library.database.prepare(`INSERT INTO nodes
    (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES (?, 'folder', ?, 'topic', 'Other body', '2026-01-01', '2026-01-01')`);
  for (let index = 0; index < count; index++) insert.run(`extra-${index}`, `Extra ${index}`);
  if (count >= 100) {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-index') ? 124 : 600;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(375);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = this.closest<HTMLElement>('[data-index]');
      const scroll = this.closest<HTMLElement>('[data-companion-page]');
      const top = this === scroll ? 0 : (row ? parseFloat(row.style.top) || 0 : 0) - (scroll?.scrollTop ?? 0);
      return new DOMRect(0, top, 375, row ? 124 : 600);
    });
  }
  render(<ReadingLibraryShell snapshot={await library.snapshot()} />);
  const row = await screen.findByRole('button', { name: 'Open topic Article' });
  const list = screen.getByTestId('companion-scroll-container');
  fireEvent.touchStart(list);
  list.scrollTop = 60;
  fireEvent.scroll(list);
  for (let round = 0; round < 2; round++) {
    fireEvent.click(row);
    const body = await screen.findByTestId('companion-article-document');
    const reader = body.closest('section.fixed')!;
    expect(row).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Article' })).toBeNull();
    expect(list).toHaveAttribute('inert');
    expect(list.scrollTop).toBe(60);
    reader.scrollTop = 790;
    fireEvent.scroll(reader);
    fireEvent.scroll(list);
    fireEvent.click(body);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open topic Article' })).toBe(row));
    expect(screen.getByTestId('companion-scroll-container')).toBe(list);
    expect(list.scrollTop).toBe(60);
  }
  await waitFor(() => expect(library.database.prepare('SELECT scroll_top AS top FROM node_view_state WHERE node_id = ?').get('article')).toEqual({ top: 790 }));
});

async function exitReader() {
  const body = await screen.findByTestId('companion-article-document');
  fireEvent.click(body);
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
}

it.each([false, true])('exits Flow into the existing or first Browse list, existing=%s', async existing => {
  const projection = vi.spyOn(browseApi, 'resolveCompanionRecentArticles');
  const snapshot = await library.snapshot();
  if (!existing) await saveCompanionNavigationResume(snapshot.libraryScope!,
    JSON.stringify(initialCompanionNavigation(true)));
  render(<ReadingLibraryShell snapshot={snapshot} />);
  let row: HTMLElement | undefined;
  if (existing) {
    row = await screen.findByRole('button', { name: 'Open topic Article' });
    fireEvent.click(screen.getByTestId('companion-tab-learn'));
  }
  await screen.findByTestId('companion-article-document');
  if (row) expect(row).not.toBeVisible();
  else expect(document.querySelector('[data-companion-page="recent"]')).toBeNull();
  const projectedBeforeExit = projection.mock.calls.length;
  await exitReader();
  const returned = await screen.findByRole('button', { name: 'Open topic Article' });
  if (row) {
    expect(returned).toBe(row);
    expect(projection.mock.calls.length).toBe(projectedBeforeExit);
  } else expect(projection.mock.calls.length).toBeGreaterThan(projectedBeforeExit);
});

it('retains a directory through reading and replaces its content when navigating elsewhere', async () => {
  const reads = vi.spyOn(externalApi, 'loadCompanionExternalDirectory');
  render(<ReadingLibraryShell snapshot={await library.snapshot()} />);
  fireEvent.click(await screen.findByTestId('companion-tab-shortcut'));
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder Folder' }));
  const row = await screen.findByRole('button', { name: 'Open topic Article' });
  const directory = row.closest('[data-companion-page]')!;
  const before = reads.mock.calls.length;
  fireEvent.click(row);
  await exitReader();
  expect(await screen.findByRole('button', { name: 'Open topic Article' })).toBe(row);
  expect(reads.mock.calls.length).toBe(before);
  fireEvent.click(screen.getByTestId('companion-top-bar-back'));
  expect(await screen.findByRole('button', { name: 'Open folder Folder' })).toBeVisible();
  expect(row).not.toBeInTheDocument();
  expect(directory).toBeInTheDocument();
});

it('keeps search query, results and scroll through reading and a visit to Browse', async () => {
  render(<ReadingLibraryShell snapshot={await library.snapshot()} />);
  fireEvent.click(await screen.findByTestId('companion-tab-search'));
  const query = await screen.findByRole('searchbox');
  fireEvent.change(query, { target: { value: 'Read' } });
  const result = await screen.findByRole('button', { name: /Article.*Read here/s });
  const scroll = screen.getByTestId('companion-scroll-container');
  scroll.scrollTop = 230;
  fireEvent.click(result);
  await screen.findByTestId('companion-article-document');
  expect(query).not.toBeVisible();
  await exitReader();
  expect(await screen.findByRole('searchbox')).toBe(query);
  expect(query).toHaveValue('Read');
  expect(result).toBeVisible();
  expect(scroll.scrollTop).toBe(230);
  fireEvent.click(screen.getByTestId('companion-tab-browse'));
  await screen.findByRole('button', { name: 'Open topic Article' });
  fireEvent.click(screen.getByTestId('companion-tab-search'));
  expect(await screen.findByRole('searchbox')).toBe(query);
  expect(scroll.scrollTop).toBe(230);
});

it('creates a destination after cold restoration directly into full text', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
    ...initialCompanionNavigation(true), activeAction: 'recent', selectedBrowseNodeId: 'article'
  }));
  render(<ReadingLibraryShell snapshot={snapshot} />);
  await screen.findByTestId('companion-article-document');
  expect(document.querySelector('[data-companion-page="recent"]')).toBeNull();
  await exitReader();
  expect(await screen.findByRole('button', { name: 'Open topic Article' })).toBeVisible();
});

it('cancels an unfinished search open when its retained page becomes inactive', async () => {
  render(<ReadingLibraryShell snapshot={await library.snapshot()} />);
  fireEvent.click(await screen.findByTestId('companion-tab-search'));
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Read' } });
  const result = await screen.findByRole('button', { name: /Article.*Read here/s });
  let finish!: (available: boolean) => void;
  vi.spyOn(searchApi, 'isCompanionSearchTopicAvailable').mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent.click(result);
  fireEvent.click(screen.getByTestId('companion-tab-browse'));
  await screen.findByRole('button', { name: 'Open topic Article' });
  await act(async () => { finish(true); });
  expect(screen.queryByTestId('companion-article-document')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open topic Article' })).toBeVisible();
});

it('releases retained pages when a replacement SQLite library reuses the same node ids', async () => {
  render(<ReadingLibraryShell snapshot={await library.snapshot()} />);
  const oldRow = await screen.findByRole('button', { name: 'Open topic Article' });
  const oldPage = oldRow.closest('[data-companion-page]');
  fireEvent.click(screen.getByTestId('companion-tab-search'));
  const oldSearch = await screen.findByRole('searchbox');
  await act(async () => {
    await library.close();
    library = await createResumeLibrary();
    library.database.exec("UPDATE nodes SET title = 'Replacement article', is_title_manual = 1 WHERE id = 'article'");
    await library.snapshot();
  });
  expect(oldRow).not.toBeInTheDocument();
  await exitReader();
  expect(await screen.findByRole('button', { name: 'Open topic Replacement article' })).not.toBe(oldRow);
  expect(oldRow).not.toBeInTheDocument();
  expect(oldPage).not.toBeInTheDocument();
  expect(oldSearch).not.toBeInTheDocument();
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), stopSyncGroupProvider: async () => {}, addListener: async () => ({ remove: async () => {} })
  }) };
});
// Native PDF rendering is outside this navigation contract; keep its production route and persistence wrapper.
vi.mock('../features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: (props: { onBackToText(): void; backLabel: string }) =>
    <button onClick={props.onBackToText}>{props.backLabel}</button>
}));

import { saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { initialCompanionNavigation } from './companionNavigationState';
import { installReadingRangeGeometry, ReadingLibraryShell } from './companionReadingPages.testSupport';

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let restoreRange: () => void;
beforeAll(() => { restoreRange = installReadingRangeGeometry(); });
afterAll(() => restoreRange());
beforeEach(async () => { library = await createSearchLibrary(60, 100); });
afterEach(async () => { cleanup(); await library.close(); });

it.each(['pdf', 'external'])('returns from a search %s to the same expanded result page', async kind => {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
    ...initialCompanionNavigation(true), activeAction: 'search'
  }));
  render(<ReadingLibraryShell snapshot={snapshot} />);
  const query = await screen.findByRole('searchbox');
  fireEvent.change(query, { target: { value: 'alpha' } });
  const more = await screen.findByRole('button', { name: 'Load more' });
  const count = screen.getAllByRole('button').length;
  fireEvent.click(more);
  await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(count));
  const resultCount = screen.getAllByRole('button').length;
  const scroll = screen.getByTestId('companion-scroll-container');
  scroll.scrollTop = 800;
  const external = screen.getByRole('heading', { name: 'External documents' }).closest('section')!;
  const result = kind === 'pdf' ? screen.getByRole('button', { name: /^PDF page 1\s/ })
    : within(external).getAllByRole('button')[0]!;
  fireEvent.click(result);
  if (kind === 'external') {
    fireEvent.click(await screen.findByTestId('companion-article-document'));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  } else fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
  expect(await screen.findByRole('searchbox')).toBe(query);
  expect(scroll.scrollTop).toBe(800);
  expect(screen.getAllByRole('button')).toHaveLength(resultCount);
  expect(result).toBeVisible();
});

it('returns an external document to its parent directory after row and menu opens', async () => {
  library.database.prepare(`INSERT INTO external_search_folders
    (id, folder_path, attachment_mode, document_count, created_at, updated_at, source_ref)
    VALUES ('folder', '/Reference', 'reference', 60, 'now', 'now', 'fixture-source')`).run();
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
    ...initialCompanionNavigation(true), activeAction: 'recent'
  }));
  render(<ReadingLibraryShell snapshot={snapshot} />);
  fireEvent.click(await screen.findByTestId('companion-tab-shortcut'));
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder Reference' }));
  const row = await screen.findByRole('button', { name: 'Open topic 000000' });
  const page = screen.getByTestId('companion-scroll-container');
  for (const menu of [false, true]) {
    if (menu) {
      fireEvent.click(screen.getByRole('button', { name: 'More: 000000' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    } else fireEvent.click(row);
    fireEvent.click(await screen.findByTestId('companion-article-document'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(await screen.findByRole('button', { name: 'Open topic 000000' })).toBe(row);
    expect(screen.getByTestId('companion-scroll-container')).toBe(page);
  }
});

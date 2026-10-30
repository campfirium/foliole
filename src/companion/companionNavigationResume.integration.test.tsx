// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen, waitFor } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { CompanionNavigationProvider, useCompanionNavigationField } from './CompanionNavigationProvider';
import { initialCompanionNavigation } from './companionNavigationState';
import { CompanionPersistedPdfDocument } from './CompanionPersistedPdfDocument';
import { useCompanionArticleScrollPosition } from './useCompanionArticleScrollPosition';
import { useCompanionImmersiveScrollPosition } from './useCompanionImmersiveScrollPosition';

const render = (ui: ReactNode) => renderUi(ui, {
  wrapper: ({ children }) => <LocalizationProvider initialLanguagePreference="en">{children}</LocalizationProvider>
});

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => { library = await createResumeLibrary(); });
afterEach(async () => { cleanup(); await library.close(); });

it('reopens the browsed article and its actual persisted scroll without advancing reading or review', async () => {
  const first = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(first.result.current).not.toBeNull());
  act(() => first.result.current.surface.handleTabAction('recent'));
  act(() => first.result.current.surface.handleSelectBrowseNode('article'));
  await waitFor(() => expect(first.result.current.surface.readableArticle?.nodeId).toBe('article'));
  act(() => first.result.current.surface.handleViewScroll(640));
  // A browser reload must flush a pending position even before the idle timer.
  fireEvent(window, new Event('pagehide'));
  await runCompanionSyncWriterTask(async () => undefined);
  const facts = library.database.prepare('SELECT * FROM node_reading').all();
  const review = library.database.prepare('SELECT * FROM node_review').all();
  first.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current?.surface.readableArticle?.nodeId).toBe('article'));
  expect(reopened.result.current.surface.activeAction).toBe('recent');
  expect(reopened.result.current.surface.readableArticle?.persistedNodeViewState?.scrollTop).toBe(640);
  function Reader() {
    const position = useCompanionImmersiveScrollPosition('article',
      reopened.result.current.surface.readableArticle?.persistedNodeViewState?.scrollTop ?? 0);
    return <section data-testid="reader" ref={position.surfaceRef} />;
  }
  render(<Reader />);
  expect(screen.getByTestId('reader').scrollTop).toBe(640);
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual(facts);
  expect(library.database.prepare('SELECT * FROM node_review').all()).toEqual(review);
});

it.each(['search', 'more', 'recent'] as const)('restores the %s page after a separate database open', async action => {
  const first = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(first.result.current).not.toBeNull());
  act(() => first.result.current.surface.handleTabAction(action));
  if (action === 'more') act(() => first.result.current.settings.setSettingsPage('storage'));
  if (action === 'recent') act(() => {
    first.result.current.setDirectoryOpen(true);
    first.result.current.directory.setDirectorySelection({ kind: 'internal', nodeId: 'folder' });
  });
  first.unmount();
  const second = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(second.result.current?.surface.activeAction).toBe(action));
  if (action === 'more') expect(second.result.current.settings.settingsPage).toBe('storage');
  if (action === 'recent') {
    expect(second.result.current.directoryOpen).toBe(true);
    expect(second.result.current.directory.directorySelection).toEqual({ kind: 'internal', nodeId: 'folder' });
  }
});

function Page() {
  const [action] = useCompanionNavigationField('activeAction', 'review');
  const [settingsPage] = useCompanionNavigationField('settingsPage', 'list');
  return <p data-testid="page">{action}:{settingsPage}</p>;
}

it('does not mount a default page or overwrite saved navigation before hydrate completes', async () => {
  const snapshot = await library.snapshot();
  const value = JSON.stringify({ ...initialCompanionNavigation(true), activeAction: 'search' });
  await saveCompanionNavigationResume(snapshot.libraryScope!, value);
  const tree = (ready: boolean) => <CompanionNavigationProvider ready={ready} snapshot={snapshot}
    libraryScope={snapshot.libraryScope!}><Page /></CompanionNavigationProvider>;
  const ui = render(tree(false));
  expect(screen.queryByTestId('page')).not.toBeInTheDocument();
  expect(await loadCompanionNavigationResume(snapshot.libraryScope!)).toBe(value);
  ui.rerender(tree(true));
  expect(screen.queryByTestId('page')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('search'));
});

it('returns an unavailable article to Browse and keeps another library isolated', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
    ...initialCompanionNavigation(true), activeAction: 'recent', selectedBrowseNodeId: 'missing'
  }));
  const ui = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  expect(ui.result.current.surface.activeAction).toBe('recent');
  expect(ui.result.current.surface.selectedBrowseNodeId).toBeNull();
  ui.unmount();
  const other = renderResumeSurface({ ...snapshot, libraryScope: 'Other library' });
  await waitFor(() => expect(other.result.current).not.toBeNull());
  expect(other.result.current.surface.activeAction).toBe('review');
});

it('shows Settings without a joined workspace instead of resurrecting a saved article', async () => {
  await saveCompanionNavigationResume('unjoined', JSON.stringify({
    ...initialCompanionNavigation(true), activeAction: 'recent', selectedBrowseNodeId: 'article'
  }));
  render(<CompanionNavigationProvider ready snapshot={null} libraryScope="unjoined"><Page /></CompanionNavigationProvider>);
  await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('more'));
});

it('restores the existing Flow card and position without resubmitting it', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'article', reading: {
    intervalDurationMs: 1000, intervalGrowthFactor: 1, lastHandledAt: '2026-01-01T00:00:00Z',
    nextAt: '2026-01-01T00:00:00Z', priority: 5, readingPosition: 0, repetitionCount: 0, state: 'active'
  } });
  await saveCompanionFlowResume(snapshot.libraryScope!, 'article');
  const first = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(first.result.current?.surface.effectiveReviewSession.currentCard?.nodeId).toBe('article'));
  act(() => first.result.current.surface.handleViewScroll(320));
  first.unmount();
  const facts = library.database.prepare('SELECT * FROM node_reading').all();
  const second = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(second.result.current?.surface.readableArticle?.nodeId).toBe('article'));
  expect(second.result.current.surface.activeAction).toBe('review');
  expect(second.result.current.surface.readableArticle?.persistedNodeViewState?.scrollTop).toBe(320);
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual(facts);
});

it('keeps a search article in its search route and returns to Search after reopening', async () => {
  const first = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(first.result.current).not.toBeNull());
  act(() => first.result.current.search.openTopic({ nodeId: 'article', title: 'Article', excerpt: '', matchStart: 0, bodyStatus: 'ready', openingText: null, updatedAt: '' }, 'Article'));
  first.unmount();
  const second = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(second.result.current?.surface.selectedBrowseNodeId).toBe('article'));
  expect(second.result.current.search.isTopicOpen).toBe(true);
  act(() => second.result.current.search.exitTopic());
  expect(second.result.current.surface.activeAction).toBe('search');
});

it('restores a folder and preserves its return destination after reading a child', async () => {
  const first = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(first.result.current).not.toBeNull());
  act(() => first.result.current.surface.handleSelectBrowseNode('folder'));
  act(() => first.result.current.surface.handleSelectBrowseNode('article'));
  first.unmount();
  const second = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(second.result.current?.surface.selectedBrowseNodeId).toBe('article'));
  act(() => second.result.current.surface.handleExitBrowseArticle());
  expect(second.result.current.surface.browsedFolder?.nodeId).toBe('folder');
});

vi.mock('../features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: (props: { positionPersistence: {
    initial?: { page: number; fraction: number }; onChange(position: { page: number; fraction: number }): void
  } }) => <button data-testid="pdf" data-position={JSON.stringify(props.positionPersistence.initial)}
    onClick={() => props.positionPersistence.onChange({ page: 5, fraction: 0.25 })}>Scroll PDF</button>
}));

function ResourceReaders() {
  const scroll = useCompanionArticleScrollPosition({ nodeId: 'external', external: true, scrollTop: 0 });
  return <><section data-testid="external" ref={scroll.surfaceRef} onScroll={scroll.handleScroll} />
    <Suspense fallback={null}><CompanionPersistedPdfDocument attachmentId="pdf" title="PDF" /></Suspense></>;
}

it('persists external text and PDF positions locally without duplicating article content', async () => {
  const snapshot = await library.snapshot();
  const tree = () => <CompanionNavigationProvider ready snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
    <ResourceReaders /></CompanionNavigationProvider>;
  const first = render(tree());
  await waitFor(() => expect(screen.getByTestId('pdf')).toBeInTheDocument());
  fireEvent.scroll(screen.getByTestId('external'), { target: { scrollTop: 720 } });
  fireEvent.click(screen.getByTestId('pdf'));
  first.unmount();
  await library.reopen();
  render(tree());
  await waitFor(() => expect(screen.getByTestId('pdf')).toHaveAttribute('data-position', '{"page":5,"fraction":0.25}'));
  expect(screen.getByTestId('external').scrollTop).toBe(720);
  const saved = await loadCompanionNavigationResume(snapshot.libraryScope!);
  expect(saved).not.toContain('# Article');
});

it('drains the pending reading position and page context at an explicit save boundary', async () => {
  const ui = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  act(() => ui.result.current.surface.handleTabAction('recent'));
  act(() => ui.result.current.surface.handleSelectBrowseNode('article'));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article'));
  act(() => ui.result.current.surface.handleViewScroll(999));
  await act(() => ui.result.current.surface.readingActivity.flush());
  expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('article')).toBe(999);
  const value = JSON.parse((await loadCompanionNavigationResume((await library.snapshot()).libraryScope!))!);
  expect(value).toMatchObject({ activeAction: 'recent', selectedBrowseNodeId: 'article' });
});

it('restores a saved page when optional external-reader context has never been written', async () => {
  const snapshot = await library.snapshot();
  const page: Partial<ReturnType<typeof initialCompanionNavigation>> = initialCompanionNavigation(true);
  delete page.externalScrollTopById;
  delete page.originalPdfNodeId;
  delete page.pdfPositionById;
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...page, activeAction: 'search' }));
  const ui = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(ui.result.current?.surface.activeAction).toBe('search'));
});

it('opens a new PDF search target instead of applying an older reading position', async () => {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
    ...initialCompanionNavigation(true), pdfPositionById: { pdf: { page: 5, fraction: 0.25 } }
  }));
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current).not.toBeNull());
  act(() => ui.result.current.search.openPdf({ attachment_id: 'pdf', page: 2, text: '', excerpt: '',
    match_start: 0, page_height: null, page_width: null }));
  expect(ui.result.current.search.pdfResult?.page).toBe(2);
  await runCompanionSyncWriterTask(async () => undefined);
  const saved = JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!);
  expect(saved.pdfPositionById.pdf).toBeUndefined();
});

it('keeps the settings subpage after reopening before joining a workspace', async () => {
  await saveCompanionNavigationResume('unjoined', JSON.stringify({
    ...initialCompanionNavigation(false), settingsPage: 'storage'
  }));
  await library.reopen();
  render(<CompanionNavigationProvider ready snapshot={null} libraryScope="unjoined"><Page /></CompanionNavigationProvider>);
  await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('more:storage'));
});

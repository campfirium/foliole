// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { loadCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { ReviewBreadcrumb } from './CompanionReviewBreadcrumb';
import { buildReviewBreadcrumbItems } from './companionReviewBreadcrumbs';

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => {
  library = await createResumeLibrary();
  const now = '2026-01-01T00:00:00Z';
  library.database.prepare('INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('item', 'article', 'Question', 'item', 'Prompt', now, now);
  library.database.prepare('INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('other', 'folder', 'Other article', 'topic', 'Browse this article', now, now);
  const snapshot = await library.snapshot();
  await saveCompanionFlowResume(snapshot.libraryScope!, false, 'item');
});
afterEach(async () => { cleanup(); await library.close(); });

function reviewFacts() {
  return {
    reading: library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all(),
    review: library.database.prepare('SELECT * FROM node_review ORDER BY node_id').all()
  };
}

it('opens both item ancestors within Flow, browses other content, and resumes the same revealed item', async () => {
  const snapshot = await library.snapshot();
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current?.surface.effectiveReviewSession.currentCard?.nodeId).toBe('item'));
  act(() => ui.result.current.surface.handleViewScroll(320));
  await act(() => ui.result.current.surface.readingActivity.flush());
  act(() => ui.result.current.surface.handleRevealAnswer());
  const before = reviewFacts();
  renderWithLocalization(<ReviewBreadcrumb items={buildReviewBreadcrumbItems(snapshot, 'item')}
    onSelectItem={nodeId => ui.result.current.surface.handleSelectBrowseNode(nodeId)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Folder' }));
  expect(ui.result.current.surface.activeAction).toBe('review');
  expect(ui.result.current.surface.browsedFolder?.nodeId).toBe('folder');
  expect(ui.result.current.surface.isFlowBrowsing).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Article', exact: true }));
  await waitFor(() => expect(ui.result.current.surface.selectedBrowseNodeId).toBe('article'));
  act(() => ui.result.current.surface.handleSelectBrowseNode('other'));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('other'));
  expect(ui.result.current.surface.activeAction).toBe('review');
  act(() => ui.result.current.surface.handleViewScroll(640));
  await act(() => ui.result.current.surface.readingActivity.flush());
  expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('other')).toBe(640);
  // Browsing and tapping reading actions cannot consume the paused Flow card.
  await act(() => ui.result.current.surface.handleReadReviewTopic());
  expect(reviewFacts()).toEqual(before);
  act(() => ui.result.current.surface.handleResumeFlow());
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('item'));
  expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('item')).toBe(320);
  expect(ui.result.current.surface.isFlowBrowsing).toBe(false);
  expect(ui.result.current.surface.isAnswerRevealed).toBe(true);
  expect(ui.result.current.surface.effectiveReviewSession.currentCard?.nodeId).toBe('item');
  expect(reviewFacts()).toEqual(before);
});

it('reopens Flow browsing and resumes its original card without changing review records', async () => {
  const snapshot = await library.snapshot();
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current?.surface.effectiveReviewSession.currentCard?.nodeId).toBe('item'));
  const before = reviewFacts();
  act(() => ui.result.current.surface.handleSelectBrowseNode('folder'));
  await runCompanionSyncWriterTask(async () => undefined);
  expect(JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!)).toMatchObject({
    activeAction: 'review', selectedBrowseNodeId: 'folder'
  });
  ui.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current?.surface.effectiveReviewSession.currentCard?.nodeId).toBe('item'));
  expect(reopened.result.current.surface.activeAction).toBe('review');
  expect(reopened.result.current.surface.browsedFolder?.nodeId).toBe('folder');
  act(() => reopened.result.current.surface.handleResumeFlow());
  await waitFor(() => expect(reopened.result.current.surface.readableArticle?.nodeId).toBe('item'));
  expect(reviewFacts()).toEqual(before);
  act(() => reopened.result.current.surface.handleTabAction('recent'));
  expect(reopened.result.current.surface.activeAction).toBe('recent');
  expect(reopened.result.current.surface.isFlowBrowsing).toBe(false);
});

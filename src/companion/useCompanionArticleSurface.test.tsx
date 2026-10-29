import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { nativeArticleFixture } from './useCompanionArticleSurfaceNative.testSupport';
import { createCompanionArticleSnapshot, createFloatingBar, createUnpairedWorkspaceSync,
  createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const fixture = nativeArticleFixture();
const readingActions = [
  ['read', 'handleReadReviewTopic'],
  ['later', 'handlePostponeReviewTopic'],
  ['dismiss', 'handleDismissReviewTopic']
] as const;

async function openReading() {
  const ui = await fixture.open(createCompanionArticleSnapshot(), async () => {
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'article-1', reading: {
      intervalDurationMs: 60000, intervalGrowthFactor: 1.5, lastHandledAt: '2026-04-22T07:00:00.000Z',
      nextAt: '2026-04-22T08:00:00.000Z', priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active'
    } });
  });
  expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article-1');
  return ui;
}

describe('useCompanionArticleSurface browsing', () => {
  it('opens the connection page first when the phone has no desktop content yet', () => {
    const ui = renderHook(() => useCompanionArticleSurface(createUnpairedWorkspaceSync(), createFloatingBar()));
    expect(ui.result.current.activeAction).toBe('more');
  });

  it('opens recent article selections in ordinary browse mode', async () => {
    const ui = await fixture.open();
    act(() => {
      ui.result.current.surface.handleTabAction('recent');
      ui.result.current.surface.handleSelectRecentArticle('article-2');
    });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article-2'));
    expect(ui.result.current.surface.activeAction).toBe('recent');
    expect(ui.result.current.surface.selectedBrowseNodeId).toBe('article-2');
    await waitFor(() => expect(fixture.library.database.prepare("SELECT value FROM workspace_meta WHERE key='active_node_id'").get())
      .toEqual({ value: 'article-2' }));
  });

  it('marks opened browse topics as last opened in the local snapshot', async () => {
    const ui = await fixture.open();
    act(() => ui.result.current.surface.handleSelectRecentArticle('article-2'));
    await waitFor(() => expect(ui.result.current.snapshot.nodeOpenStateById?.['article-2']?.lastOpenedAt).toBeTruthy());
    expect(fixture.library.database.prepare("SELECT last_opened_at FROM node_open_state WHERE node_id='article-2'").get())
      .toEqual({ last_opened_at: ui.result.current.snapshot.nodeOpenStateById!['article-2']!.lastOpenedAt });
    expect(ui.result.current.workspace.refreshAfterMutation).not.toHaveBeenCalledWith(
      expect.objectContaining({ nodeOpenStateById: expect.anything() }));
  });

  it('reads complete local content without starting an extra sync', async () => {
    const snapshot = createCompanionArticleSnapshot();
    const body = 'Complete local body\n中文 original text';
    snapshot.nodesById['article-2']!.content = body;
    const ui = await fixture.open(snapshot);
    act(() => {
      ui.result.current.surface.handleTabAction('recent');
      ui.result.current.surface.handleSelectRecentArticle('article-2');
    });
    await waitFor(() => expect(ui.result.current.surface.readableArticle).toMatchObject({
      nodeId: 'article-2', content: body, bodyStatus: 'ready'
    }));
    expect(ui.result.current.workspace.pullFromDesktop).not.toHaveBeenCalled();
  });

});

describe('useCompanionArticleSurface browse state', () => {
  it('keeps the current readable article available when snapshot recent rows are empty', () => {
    const ui = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(null), createFloatingBar()));
    expect(ui.result.current.recentArticles).toEqual([{
      nodeId: 'article-1', preview: null, title: 'First article', updatedAt: ''
    }]);
  });

  it('persists companion scroll view state after scroll settles', async () => {
    const ui = await fixture.open();
    act(() => ui.result.current.surface.handleSelectRecentArticle('article-2'));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article-2'));
    act(() => ui.result.current.surface.handleViewScroll(128));
    await waitFor(() => expect(fixture.library.database.prepare("SELECT scroll_top FROM node_view_state WHERE node_id='article-2'").get())
      .toMatchObject({ scroll_top: 128 }), { timeout: 3000 });
  });

  it('opens topic containers as browse surfaces while keeping leaf topics readable', async () => {
    const snapshot = createCompanionArticleSnapshot();
    snapshot.nodesById['article-3'] = { ...snapshot.nodesById['article-2']!, id: 'article-3',
      parentNodeId: 'article-2', title: 'Nested child', content: '# Child\n\nNested body' };
    snapshot.nodeOrder.push('article-3');
    const ui = await fixture.open(snapshot);
    act(() => ui.result.current.surface.handleSelectBrowseNode('article-2'));
    await waitFor(() => expect(ui.result.current.surface.browsedFolder?.nodeId).toBe('article-2'));
    expect(ui.result.current.surface.browsedFolder?.items.map(item => item.nodeId)).toEqual(['article-3']);
    act(() => ui.result.current.surface.handleSelectBrowseNode('article-1'));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article-1'));
    expect(ui.result.current.surface.browsedFolder).toBeNull();
  });

  it('opens folder breadcrumbs as folder browse surfaces', async () => {
    const ui = await fixture.open();
    act(() => ui.result.current.surface.handleSelectBrowseNode('folder-1'));
    expect(ui.result.current.surface.activeAction).toBe('review');
    expect(ui.result.current.surface.isFlowBrowsing).toBe(true);
    expect(ui.result.current.surface.browsedFolder?.nodeId).toBe('folder-1');
    expect(ui.result.current.surface.readableArticle).toBeNull();
  });
});

describe('useCompanionArticleSurface reading review persistence', () => {
  it.each(readingActions)('persists %s with one durable learning operation', async (action, method) => {
    const ui = await openReading();
    const target = ui.result.current.surface.readableArticle!.nodeId;
    const before = ui.result.current.snapshot.nodesById[target]!.reading!;
    await act(async () => { await ui.result.current.surface[method](); });
    await fixture.settle();
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(target));
    const reading = fixture.library.database.prepare('SELECT * FROM node_reading WHERE node_id=?').get(target);
    expect(reading).toBeTruthy();
    if (action === 'read') expect(reading).toMatchObject({ repetition_count: before.repetitionCount + 1 });
    if (action === 'later') expect(ui.result.current.snapshot.nodesById[target]?.reading?.nextAt).not.toBe(before.nextAt);
    if (action === 'dismiss') expect(reading).toMatchObject({ state: 'dismissed' });
    expect(ui.result.current.snapshot.nodesById[target]?.reading).not.toBeNull();
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(1);
  });

  it.each(readingActions)('does not advance or replace saved facts when %s admission fails', async (action, method) => {
    const ui = await openReading();
    const before = ui.result.current.snapshot;
    const facts = fixture.library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
    const target = ui.result.current.surface.readableArticle!.nodeId;
    await fixture.rejectAdmission(action);
    await act(async () => { await ui.result.current.surface[method](); });
    expect(ui.result.current.surface.readingError).toContain('admission unavailable');
    expect(ui.result.current.surface.readableArticle?.nodeId).toBe(target);
    expect(ui.result.current.snapshot).toEqual(before);
    expect(fixture.library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(facts);
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(0);
    if (action === 'read') expect(await (await getCompanionReadIntents()).journal.rows(false)).toEqual([]);
  });

  it.each(readingActions)('ignores concurrent duplicate %s submissions', async (action, method) => {
    const ui = await openReading();
    const target = ui.result.current.surface.readableArticle!.nodeId;
    await act(async () => {
      const first = ui.result.current.surface[method]();
      const second = ui.result.current.surface[method]();
      await Promise.all([first, second]);
    });
    await fixture.settle();
    expect(fixture.library.database.prepare('SELECT node_id FROM node_reading').all()).toEqual([{ node_id: target }]);
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(1);
    if (action === 'read') expect(ui.result.current.snapshot.nodesById[target]?.reading?.repetitionCount).toBe(2);
    if (action === 'read') expect(await (await getCompanionReadIntents()).journal.rows(false)).toHaveLength(1);
  });
});

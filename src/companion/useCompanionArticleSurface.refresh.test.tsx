import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { applyCompanionSyncObjects } from '../shared/platform/companionSyncObjects';
import { toReadingPayload } from '../shared/platform/companionSyncStateWriters';

import { ARTICLE_NOW, nativeArticleFixture } from './useCompanionArticleSurfaceNative.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const fixture = nativeArticleFixture();

describe('useCompanionArticleSurface remote refresh', () => {
  it('refreshes the selected readable article when synced node content changes', async () => {
    const ui = await fixture.open();
    act(() => {
      ui.result.current.surface.handleTabAction('recent');
      ui.result.current.surface.handleSelectRecentArticle('article-1');
    });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('article-1'));
    const node = ui.result.current.snapshot.nodesById['article-1']!;
    await act(async () => {
      await fixture.apply([{ ...node, content: '# First article\n\nUpdated remote body', updatedAt: ARTICLE_NOW }]);
      await ui.result.current.workspace.refreshAfterMutation();
    });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('Updated remote body'));
    expect(ui.result.current.surface.recentArticles.find(article => article.nodeId === 'article-1')?.preview)
      .toContain('Updated remote body');
    expect(fixture.library.database.prepare("SELECT content FROM nodes WHERE id='article-1'").get())
      .toEqual({ content: '# First article\n\nUpdated remote body' });
  });

  it('keeps visible current reading material when its remote schedule changes', async () => {
    const ui = await fixture.open();
    const target = ui.result.current.surface.readableArticle!.nodeId;
    const node = ui.result.current.snapshot.nodesById[target]!;
    const content = ui.result.current.surface.readableArticle!.content;
    await act(async () => {
      const payload = JSON.stringify(toReadingPayload({
        intervalDurationMs: 60000, intervalGrowthFactor: 1.5, lastHandledAt: ARTICLE_NOW,
        nextAt: '2099-01-01T00:00:00.000Z', priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active'
      }));
      await applyCompanionSyncObjects([{ object_id: node.id, object_type: 'node_reading',
        content_hash: hashTextBody(payload), deleted_at: null, payload_json: payload, updated_at: ARTICLE_NOW }]);
      await ui.result.current.workspace.refreshAfterMutation(undefined, target);
    });
    await waitFor(() => expect(ui.result.current.snapshot.nodesById[target]?.reading?.nextAt).toBe('2099-01-01T00:00:00.000Z'));
    expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe(target);
    expect(ui.result.current.surface.readableArticle).toMatchObject({ nodeId: target, content });
  });
});

import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { readNodeReviewHistoryWithDb } from '../../lib/core/database/reviewProjection';
import { previewReviewAt } from '../../lib/core/review/recomputeReview';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings, getReviewSchedulerVersion } from '../features/settings/model/reviewSchedulerSettings';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { applyCompanionSyncReviewLog } from '../shared/platform/companionSyncObjects';

import { ARTICLE_NOW, nativeArticleFixture } from './useCompanionArticleSurfaceNative.testSupport';
import { createCompanionArticleSnapshot } from './useCompanionArticleSurfaceTestSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const fixture = nativeArticleFixture();

async function openCard() {
  const snapshot = createCompanionArticleSnapshot();
  snapshot.nodesById = { 'item-1': { ...snapshot.nodesById['article-1']!, id: 'item-1', kind: 'item',
    parentNodeId: null, content: 'Question prompt', reveal: 'Answer', review: {
      difficulty: 4.2, due: '2026-04-22T08:00:00.000Z', elapsedDays: 2, lapses: 0,
      lastReviewAt: '2026-04-20T08:00:00.000Z', reps: 3, scheduledDays: 2, stability: 2.1, state: 2
    } } };
  snapshot.nodeOrder = ['item-1'];
  const ui = await fixture.open(snapshot, async () => {
    await applyCompanionSyncReviewLog(['2026-04-10', '2026-04-11', '2026-04-12'].map((day, index) => ({
      id: `seed-${index}`, op_id: `seed-${index}`, host_name: 'remote', node_id: 'item-1',
      grade: 3, scheduler_version: getReviewSchedulerVersion(getCurrentReviewSchedulerSettings()),
      reviewed_at: `${day}T08:00:00.000Z`, kind: 'review' as const, voids_op_id: null
    })));
  });
  expect(ui.result.current.snapshot.nodesById['item-1']?.review?.reps).toBe(3);
  act(() => ui.result.current.surface.handleRevealAnswer());
  return ui;
}

describe('useCompanionArticleSurface fsrs sync', () => {
  it.each([1, 2, 3, 4] as const)('persists FSRS grade %s with its review log fact', async grade => {
    const ui = await openCard();
    const { events, parameters } = await getIosCompanionDatabaseOwner().read(db => readNodeReviewHistoryWithDb(db, 'item-1'));
    const expected = previewReviewAt(events, parameters, { grade, now: ARTICLE_NOW });
    expect(expected).not.toBeNull();
    await act(async () => { await ui.result.current.surface.handleGradeReview(grade); });
    expect(ui.result.current.surface.reviewError).toBeNull();
    const saved = fixture.library.database.prepare("SELECT * FROM node_review WHERE node_id='item-1'").get();
    expect(saved).toMatchObject({ reps: 4, last_review_at: ARTICLE_NOW });
    expect(ui.result.current.snapshot.nodesById['item-1']?.review).toMatchObject({ reps: 4, lastReviewAt: ARTICLE_NOW });
    expect(ui.result.current.snapshot.nodesById['item-1']?.review).toEqual(toNodeReviewProfile(expected!));
    expect(saved).toMatchObject({ due: expected!.due, scheduled_days: expected!.scheduled_days,
      difficulty: expected!.difficulty, stability: expected!.stability });
    const logs = fixture.library.database.prepare("SELECT * FROM review_log WHERE node_id='item-1' AND reviewed_at=?").all(ARTICLE_NOW);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ grade, reviewed_at: ARTICLE_NOW, kind: 'review',
      scheduler_version: getReviewSchedulerVersion(getCurrentReviewSchedulerSettings()) });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(1);
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard).toBeNull());
  });

  it('does not replace the companion snapshot when grade persistence fails', async () => {
    const ui = await openCard();
    const before = ui.result.current.snapshot;
    const facts = fixture.library.database.prepare('SELECT * FROM node_review').all();
    const logs = fixture.library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all();
    await fixture.rejectAdmission('grade');
    await act(async () => { await ui.result.current.surface.handleGradeReview(3); });
    expect(ui.result.current.surface.reviewError).toContain('admission unavailable');
    expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe('item-1');
    expect(ui.result.current.snapshot).toEqual(before);
    expect(fixture.library.database.prepare('SELECT * FROM node_review').all()).toEqual(facts);
    expect(fixture.library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(logs);
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(0);
  });

  it('ignores concurrent duplicate fsrs review submissions', async () => {
    const ui = await openCard();
    await act(async () => {
      const first = ui.result.current.surface.handleGradeReview(3);
      const second = ui.result.current.surface.handleGradeReview(3);
      await Promise.all([first, second]);
    });
    expect(ui.result.current.surface.reviewError).toBeNull();
    expect(fixture.library.database.prepare("SELECT reps FROM node_review WHERE node_id='item-1'").get()).toEqual({ reps: 4 });
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM review_log WHERE reviewed_at=?').get(ARTICLE_NOW)).toEqual({ n: 1 });
    expect(fixture.library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    expect(await fixture.historyCount(ui.result.current.surface.flowHistoryKey)).toBe(1);
  });
});

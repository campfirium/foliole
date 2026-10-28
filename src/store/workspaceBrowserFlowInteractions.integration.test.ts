// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';

import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { browserFlow, flowNode, flowNow as now } from './workspaceBrowserFlow.testSupport';

const stamp = (minutes: number) => new Date(Date.parse(now) + minutes * 60000).toISOString();
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now)); });
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.useRealTimers(); });

it.each(['read', 'later', 'dismiss'] as const)('keeps %s and progress unchanged while browsing another topic', async action => {
  const store = browserFlow([flowNode('a'), flowNode('b')]);
  await store.getState().startReviewSession(now);
  const target = store.getState().reviewSession.currentNodeId!;
  store.getState().setActiveNode(target === 'a' ? 'b' : 'a');
  const before = localStorage.getItem('foliole-workspace-v1');
  const run = { read: store.getState().readReviewTopic, later: store.getState().postponeReviewTopic,
    dismiss: store.getState().dismissReviewTopic }[action];
  expect(await run(now)).toBe(false);
  expect(localStorage.getItem('foliole-workspace-v1')).toBe(before);
});

it('grades a cloze and follows the receipt across browse roots', async () => {
  const folder = (id: string) => flowNode(id, false, { kind: 'folder', content: '' });
  const store = browserFlow([folder('left'), folder('right'),
    flowNode('cloze', true, { parentNodeId: 'left', anchorLink: { id: 'anchor', kind: 'cloze' } }),
    flowNode('other', true, { parentNodeId: 'right' })]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'cloze' });
  store.getState().revealReviewAnswer();
  expect(await store.getState().gradeReviewCard(3, stamp(1))).toBe(true);
  expect(store.getState().nodesById.cloze!.review?.reps).toBe(1);
  expect(store.getState().reviewSession.currentNodeId).toBe('other');
  expect(store.getState().browseRootNodeId).toBe('right');
  store.getState().revealReviewAnswer();
  expect(await store.getState().gradeReviewCard(4, stamp(2))).toBe(true);
  expect(store.getState().reviewSession.currentNodeId).toBeNull();
  expect(store.getState().reviewSession.reviewedItemCount).toBe(2);
  const earliest = ['cloze', 'other'].map(id => store.getState().nodesById[id]!.review!.due).sort()[0];
  expect(store.getState().reviewSession.nextReviewDueAt).toBe(earliest);
});

it.each([true, false])('tracks elapsed time separately for review=%s', async review => {
  const store = browserFlow([flowNode('a', review), flowNode('b', review)]);
  await store.getState().startReviewSession(now);
  store.getState().revealReviewAnswer();
  expect(await (review ? store.getState().gradeReviewCard(4, stamp(18)) : store.getState().readReviewTopic(stamp(18)))).toBe(true);
  const session = store.getState().reviewSession;
  expect(session.reviewElapsedMs).toBe(review ? 1080000 : 0);
  expect(session.readingElapsedMs).toBe(review ? 0 : 1080000);
  expect(session.currentItemStartedAt).toBe(stamp(18));
});

it('keeps repeated Soon unique without scheduling first-time topics', async () => {
  const store = browserFlow([flowNode('a'), flowNode('b')]);
  await store.getState().startReviewSession(now);
  const first = store.getState().reviewSession.currentNodeId!;
  await store.getState().revisitReviewTopicSoon(now);
  const second = store.getState().reviewSession.currentNodeId!;
  await store.getState().revisitReviewTopicSoon(now);
  expect(store.getState().reviewSession.currentNodeId).toBe(first);
  await store.getState().revisitReviewTopicSoon(now);
  expect(store.getState().reviewSession.currentNodeId).toBe(second);
  expect(store.getState().reviewSession.readTopicCount).toBe(2);
  expect(store.getState().nodesById[first]!.reading ?? null).toBeNull();
  expect(store.getState().nodesById[second]!.reading ?? null).toBeNull();
});

it('persists a first-time dismiss and restores its reading and current item through history', async () => {
  const store = browserFlow([flowNode('a')]);
  await store.getState().startReviewSession(now);
  expect(await store.getState().dismissReviewTopic(now)).toBe(true);
  expect(store.getState().nodesById.a!.reading?.state).toBe('dismissed');
  expect(store.getState().reviewSession.readTopicCount).toBe(1);
  expect(store.getState().reviewSession.completedAt).toBe(now);
  expect(await store.getState().undoWorkspaceAction()).toBe(true);
  expect(store.getState().reviewSession.currentNodeId).toBe('a');
  expect(store.getState().nodesById.a!.reading ?? null).toBeNull();
  expect(await store.getState().redoWorkspaceAction()).toBe(true);
  expect(store.getState().nodesById.a!.reading?.state).toBe('dismissed');
});

it.each([false, true])('preserves sequential locking until advance-ready=%s', async releaseSequentialReading => {
  const store = browserFlow([flowNode('book', false, { kind: 'folder', content: '', sequentialReadingEnabled: true }),
    flowNode('first', false, { parentNodeId: 'book' }), flowNode('second', false, { parentNodeId: 'book' })]);
  await store.getState().setNodeSequentialReading('book', true, now);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'first' });
  expect(await store.getState().readReviewTopic(now, { releaseSequentialReading })).toBe(true);
  expect(store.getState().nodesById.second!.reading?.state).toBe(releaseSequentialReading ? 'active' : 'locked');
});

it('retains a selected mode within its day and expires it at the next learning boundary', async () => {
  const store = browserFlow([flowNode('a', true), flowNode('b')]);
  await store.getState().setReviewSessionMode('review-first', now);
  await store.getState().startReviewSession(now);
  expect(store.getState().reviewSessionMode).toBe('review-first');
  store.getState().exitReviewSession();
  await store.getState().startReviewSession(stamp(1));
  expect(store.getState().reviewSessionMode).toBe('review-first');
  store.getState().exitReviewSession();
  await store.getState().startReviewSession('2026-10-29T08:00:00.000Z');
  expect(store.getState().reviewSessionMode).toBe('recommended');
});

it('applies topic delay outside Flow and then grades through browser storage', async () => {
  const store = browserFlow([flowNode('a'), flowNode('b', true)]);
  expect(await store.getState().setReviewTopicDelay('a', 2, now)).toBe(true);
  expect(Date.parse(store.getState().nodesById.a!.reading!.nextAt)).toBeGreaterThan(Date.parse(now));
  await store.getState().startReviewSession(now);
  expect(store.getState().reviewSession.currentNodeId).toBe('b');
  store.getState().revealReviewAnswer();
  expect(await store.getState().gradeReviewCard(3, now)).toBe(true);
  expect(store.getState().nodesById.b!.review?.reps).toBe(1);
});

it('refreshes a stale future review instead of recording another grade', async () => {
  const store = browserFlow([flowNode('a', true), flowNode('b', true)]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'a' });
  store.getState().revealReviewAnswer();
  store.setState(state => ({ nodesById: { ...state.nodesById, a: { ...state.nodesById.a!, review: {
    due: '2026-11-28T08:00:00.000Z', lastReviewAt: now, state: 2, stability: 3, difficulty: 4,
    elapsedDays: 1, scheduledDays: 30, reps: 1, lapses: 0 } } } }));
  await store.getState().gradeReviewCard(3, now);
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('b'));
  expect(store.getState().nodesById.a!.review!.reps).toBe(1);
  expect(Object.values(store.getState().browserDailyFlow!.reviewEvents)).toHaveLength(0);
});

it('releases the next sequential topic without completing earlier active material', async () => {
  const store = browserFlow([flowNode('book', false, { kind: 'folder', content: '', sequentialReadingEnabled: true,
    manualChildOrder: ['first', 'second', 'third', 'fourth'] }),
    ...['first', 'second', 'third', 'fourth'].map(id => flowNode(id, false, { parentNodeId: 'book' }))]);
  await store.getState().setNodeSequentialReading('book', true, now);
  store.setState(state => ({ nodesById: { ...state.nodesById,
    third: { ...state.nodesById.third!, reading: { ...state.nodesById.third!.reading!, state: 'active' } } } }));
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'third' });
  expect(await store.getState().readReviewTopic(now, { releaseSequentialReading: true })).toBe(true);
  expect(store.getState().nodesById.first!.reading!.state).toBe('active');
  expect(store.getState().nodesById.fourth!.reading!.state).toBe('active');
});

it.each(['review-first', 'reading-only'] as const)('falls back before starting when %s has no matching work', async mode => {
  const store = browserFlow([flowNode('a', mode === 'reading-only')]);
  await store.getState().setReviewSessionMode(mode, now);
  expect(await store.getState().startReviewSession(now)).toBe(true);
  expect(store.getState().reviewSessionMode).toBe('recommended');
  expect(store.getState().reviewSession.totalNodeCount).toBe(1);
  expect(store.getState().reviewSession.currentNodeId).toBe('a');
});

it('does not count simultaneous duplicate Read requests twice', async () => {
  const store = browserFlow([flowNode('a'), flowNode('b')]);
  await store.getState().startReviewSession(now);
  const outcomes = await Promise.all([store.getState().readReviewTopic(now), store.getState().readReviewTopic(now)]);
  expect(outcomes.filter(Boolean)).toHaveLength(1);
  expect(store.getState().reviewSession.readTopicCount).toBe(1);
  expect(store.getState().appActionHistory.undoStack).toHaveLength(1);
});

it('reconciles shelving and its history through the service without losing the prior current', async () => {
  const store = browserFlow([flowNode('source'), flowNode('child', false, { parentNodeId: 'source' }), flowNode('other')]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'child' });
  expect(store.getState().shelveNode('source', now)).toBe(true);
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('other'));
  expect(await store.getState().undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('child'));
  expect(store.getState().nodesById.source!.shelvedAt).toBeNull();
  expect(await store.getState().redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('other'));
  expect(store.getState().reviewSession.readTopicCount).toBe(0);
});

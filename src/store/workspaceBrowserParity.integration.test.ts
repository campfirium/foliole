// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { commitCycleFlow } from '../../lib/core/flow/cycleFlowCommit';
import { openStoredDailyFlow } from '../../lib/core/flow/cycleFlowOpen';
import type { DailyFlowCommitArgs, DailyFlowResult } from '../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlowView, readStoredDailyFlowView } from '../../lib/core/flow/dailyFlowView';
import { readCompanionReviewTopic } from '../companion/companionReadingReview';
import { gradeCompanionReviewCard } from '../companion/companionReviewSession';
import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { createBrowserDailyFlowStore, type BrowserFlowWorkspace } from '../shared/platform/runtime/browserDailyFlowStore';
import { node, now, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it('uses the same order, Soon fairness, learning facts and next target on SQLite and browser storage', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  for (const id of ['x', 'y']) node(peer, id, 'item');
  const snapshot = await persistence.snapshot(peer.port);
  let state: BrowserFlowWorkspace = { ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById)
    .map(([id, node]) => [id, { ...node, anchorLink: null }])), browserDailyFlow: emptyBrowserDailyFlow() };
  const browser = createBrowserDailyFlowStore(() => state, patch => { state = { ...state, ...patch }; });
  const config = settings(peer);
  let native = await openDailyFlow(peer.port, { now, mode: 'recommended' }, config, persistence);
  let local: DailyFlowResult = await openStoredDailyFlow(browser, { now, mode: 'recommended' }, config);
  expect(local.session).toEqual(native.session);
  for (let step = 0; step < 8 && native.session.currentNodeId; step++) {
    const id = native.session.currentNodeId;
    const current = await persistence.snapshot(peer.port);
    const args: DailyFlowCommitArgs = { opId: `parity-${step}`, now, token: native.session.daily!, sourceSession: native.session };
    if (current.nodesById[id]!.kind === 'item') {
      const grade = await gradeCompanionReviewCard({ snapshot: { ...current, activeNodeId: id,
        untitledSequenceByParent: {} }, nodeId: id, grade: 3, now });
      if (!grade) throw new Error('missing_parity_grade');
      args.grade = { nodeId: id, before: current.nodesById[id]!.review, grade: 3, reviewedAt: now,
        schedulerVersion: grade.reviewLog.schedulerVersion, cardBefore: grade.reviewLog.cardBefore,
        cardAfter: grade.reviewLog.cardAfter };
    } else {
      const soon = step < 3;
      const after = soon ? current.nodesById[id]!.reading : readCompanionReviewTopic({ snapshot: {
        ...current, activeNodeId: id, untitledSequenceByParent: {} }, nodeId: id, now })!.snapshot.nodesById[id]!.reading;
      args.readingAction = soon ? 'soon' : 'read';
      args.readings = [{ nodeId: id, before: current.nodesById[id]!.reading ?? null, after: after ?? null }];
    }
    native = await commitDailyFlow(peer.port, args, config, persistence);
    local = await commitCycleFlow(browser, args, config);
    expect(local.session).toEqual(native.session);
    const viewArgs = { now, mode: 'recommended' as const, includeEntries: true };
    expect(await readStoredDailyFlowView(browser, viewArgs, config)).toEqual(
      await readDailyFlowView(peer.port, viewArgs, config, persistence));
    const saved = await persistence.snapshot(peer.port);
    for (const nodeId of ['a', 'b', 'c', 'x', 'y']) {
      expect(state.nodesById[nodeId]?.reading ?? null).toEqual(saved.nodesById[nodeId]?.reading ?? null);
      expect(state.nodesById[nodeId]?.review ?? null).toEqual(saved.nodesById[nodeId]?.review ?? null);
    }
  }
  expect(local.session.readTopicCount).toBe(3);
  expect(local.session.reviewedItemCount).toBe(2);
});

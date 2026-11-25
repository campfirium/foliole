// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import type { DailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowContract.js';
import type { DailyFlowSession, DiveFlowCursor } from '../../lib/core/flow/dailyFlowSession.js';
import type { DailyFlowStore } from '../../lib/core/flow/dailyFlowStore.js';
import { selectDiveCurrent } from '../../lib/core/flow/diveCycleFlow.js';

import { addNode, now, readArgs, setup } from './diveDailyFlow.testSupport.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);

it('reads only Dive members while choosing the next entry in a large daily list', async () => {
  const requested = new Set<string>();
  const { peer, open, commit, scope } = await setup('topic', ids => ids.forEach(id => requested.add(id)));
  const outside = Array.from({ length: 200 }, (_, index) => `outside-${index}`);
  for (const [index, id] of outside.entries()) addNode(peer, id, index % 4, 'topic');
  const global = (await open()).session;
  const group = scope(['b', 'c']);
  const outsideRead = () => outside.filter(id => requested.has(id) && id !== global.currentNodeId);
  requested.clear();
  let session = (await open({ dive: group })).session;
  expect(outsideRead()).toEqual([]);
  const seen: string[] = [];
  while (session.currentNodeId) {
    const nodeId = session.currentNodeId;
    seen.push(nodeId);
    requested.clear();
    session = (await commit({ opId: `read-${nodeId}`, now, token: session.daily!, sourceSession: session,
      ...readArgs(nodeId), readings: [...readArgs(nodeId).readings] })).session;
    expect(outsideRead()).toEqual([]);
  }
  expect(seen.sort()).toEqual(['b', 'c']);
});

it('stops reading unread Dive Topics once the next one is found', async () => {
  const members = Array.from({ length: 200 }, (_, index) => `topic-${String(index).padStart(3, '0')}`);
  const requested: string[] = [];
  const store = {
    readDiveMembers: async () => members,
    scopedLearningSnapshot: async (ids: readonly (string | null | undefined)[]) => {
      requested.push(...ids as string[]);
      return { trashedNodeIds: [], nodesById: Object.fromEntries((ids as string[]).map(id => [id, {
        id, kind: 'topic', parentNodeId: null, title: id, content: 'Body',
        // The first 40 members were already read, so the next unread one sits in the second batch.
        reading: members.indexOf(id) < 40 ? { state: 'active', repetitionCount: 1 } : null
      }])) } as unknown as DailyFlowLearningSnapshot;
    }
  } as unknown as DailyFlowStore;
  const dive = { id: 'dive', topicIds: [], mode: 'reading-only', phase: 'topics', position: 0, limit: 0,
    stop: null, hasWork: false } as unknown as DiveFlowCursor;
  const session = await selectDiveCurrent(store, {} as DailyFlowSession, dive, now, {} as never);
  expect(session).toMatchObject({ currentNodeId: 'topic-040', dive: { position: 41, limit: 200, stop: null } });
  expect(requested.length).toBeLessThanOrEqual(64);
});

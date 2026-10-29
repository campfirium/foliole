// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';

import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

let peer: Peer;
const now = '2026-10-30T00:00:00.000Z';
const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
  priority: 3, readingPosition: 0, repetitionCount: 9, state: 'locked' as const };
beforeEach(async () => {
  await startLibraries();
  peer = createPeer('summary');
  upsertNodeSnapshot(peer.driver, { nodeId: 'topic', parentNodeId: null, kind: 'topic', title: 'Topic', content: 'Body',
    reveal: null, anchorLink: null, isTitleManual: true, createdAt: now, updatedAt: now, position: 0, reading, hostName: peer.name });
});
afterEach(async () => closeLibraries());

it('reads only list learning facts on hydration and targeted projection while exact facts remain queryable', () => {
  for (const node of [loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!.nodesById.topic,
    loadWorkspaceListProjection(peer.driver, { nodeIds: ['topic'], structure: false }).nodesById.topic]) {
    expect(node).not.toHaveProperty('reading');
    expect(node).not.toHaveProperty('review');
    expect(node?.learningSummary).toEqual({ reading: { state: 'locked', repetitionCount: 9 }, review: null });
  }
  expect(readWorkspaceNodeLearning(peer.driver, ['topic'])[0]?.reading).toEqual(reading);
  peer.db.prepare("DELETE FROM node_reading WHERE node_id='topic'").run();
  expect(loadWorkspaceListSnapshot(peer.driver)!.nodesById.topic?.learningSummary?.reading).toBeNull();
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';
import { parseNodeSnapshotArgs } from '../ipc/commandParserNodeSnapshot.js';

import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

let peer: Peer;
const now = '2026-10-29T01:00:00.000Z';
const input = { nodeId: 'topic', kind: 'topic', title: 'Topic', content: 'Original', isTitleManual: true,
  parentNodeId: null, reveal: null, createdAt: now, updatedAt: now };
const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
  priority: 3, readingPosition: 27, repetitionCount: 9, state: 'active' as const };
beforeEach(async () => {
  await startLibraries(); peer = createPeer('content-host');
  upsertNodeSnapshot(peer.driver, { ...parseNodeSnapshotArgs({ ...input, reading }), hostName: peer.name });
});
afterEach(closeLibraries);

it('preserves durable learning and host progress when content arrives without learning fields', () => {
  const before = readWorkspaceNodeLearning(peer.driver, ['topic']);
  const sync = peer.db.prepare("SELECT * FROM sync_object_state WHERE object_type='node_reading'").all();
  const parsed = parseNodeSnapshotArgs({ ...input, content: 'Edited content' });
  upsertNodeSnapshot(peer.driver, { ...parsed, hostName: peer.name });
  expect(readWorkspaceNodeLearning(peer.driver, ['topic'])).toEqual(before);
  expect(peer.db.prepare("SELECT * FROM sync_object_state WHERE object_type='node_reading'").all()).toEqual(sync);
  expect(parsed).not.toHaveProperty('reading');
  expect(parsed).not.toHaveProperty('review');
});

it('retains explicit clearing and complete reading replacement as distinct write intentions', () => {
  upsertNodeSnapshot(peer.driver, { ...parseNodeSnapshotArgs({ ...input, reading: null }), hostName: peer.name });
  expect(readWorkspaceNodeLearning(peer.driver, ['topic'])[0]?.reading).toBeNull();
  expect(peer.db.prepare("SELECT * FROM node_reading_host_state WHERE node_id='topic'").all()).toEqual([]);
  upsertNodeSnapshot(peer.driver, { ...parseNodeSnapshotArgs({ ...input, reading }), hostName: peer.name });
  expect(readWorkspaceNodeLearning(peer.driver, ['topic'])[0]?.reading).toEqual(reading);
});

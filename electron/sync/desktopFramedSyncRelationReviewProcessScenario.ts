import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersions.js';

export const RELATION_REVIEW_SCENARIO = Object.freeze({
  baseVersionId: 't326-base-version',
  childVersionId: 't326-child-version',
  nodeId: 't326-relation-review',
  reviewOpId: 't326-review-op'
});

type Role = 'receiver' | 'receiver_conflict' | 'sender';

function writeNode(content: string, updatedAt: string) {
  upsertNodeSnapshot({
    anchorLink: null,
    content,
    createdAt: '2026-10-05T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: RELATION_REVIEW_SCENARIO.nodeId,
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Relation and review transfer',
    updatedAt
  });
}

function insertReview(grade: number) {
  openDatabaseConnection().driver.execute(`INSERT INTO review_log (
    id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
    due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    't326-review-row', RELATION_REVIEW_SCENARIO.reviewOpId, 'desktop-a',
    RELATION_REVIEW_SCENARIO.nodeId, grade, 'fsrs-6', '2026-10-05T01:00:00.000Z',
    '2026-10-06T00:00:00.000Z', 2.5, 2.25, '2026-10-08T00:00:00.000Z', 4.5, 3.75
  ]);
}

export function seedDesktopFramedSyncRelationReviewScenario(role: Role) {
  const driver = openDatabaseConnection().driver;
  writeNode('Shared base body', '2026-10-05T00:00:00.000Z');
  flushNodeSyncVersionWithDriver(
    driver, RELATION_REVIEW_SCENARIO.nodeId, 'scenario-host',
    '2026-10-05T00:00:00.000Z', RELATION_REVIEW_SCENARIO.baseVersionId
  );
  if (role === 'sender') {
    writeNode('Incoming child body', '2026-10-05T01:00:00.000Z');
    flushNodeSyncVersionWithDriver(
      driver, RELATION_REVIEW_SCENARIO.nodeId, 'scenario-host',
      '2026-10-05T01:00:00.000Z', RELATION_REVIEW_SCENARIO.childVersionId
    );
    insertReview(3);
  } else if (role === 'receiver_conflict') {
    insertReview(4);
  }
}

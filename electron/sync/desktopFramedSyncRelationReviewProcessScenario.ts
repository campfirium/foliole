import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { recomputeNodeReview } from '../../lib/core/database/reviewProjection.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersions.js';

export const RELATION_REVIEW_SCENARIO = Object.freeze({
  baseVersionId: 't326-base-version',
  childVersionId: 't326-child-version',
  nodeId: 't326-relation-review',
  reviewOpId: 't326-review-op'
});

type Role = 'receiver' | 'receiver_conflict' | 'sender' | 'review_only' | 'control_events';

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
  openDatabaseConnection().driver.execute(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, ['t326-review-row', RELATION_REVIEW_SCENARIO.reviewOpId, 'desktop-a', RELATION_REVIEW_SCENARIO.nodeId, grade, 'fsrs-6', '2026-10-05T01:00:00.000Z']);
  recomputeNodeReview(openDatabaseConnection().driver, RELATION_REVIEW_SCENARIO.nodeId);
}

export function seedDesktopFramedSyncRelationReviewScenario(role: Role) {
  if (role === 'control_events') {
    const driver = openDatabaseConnection().driver;
    for (const kind of ['void', 'reset'] as const) driver.execute(INSERT_REVIEW_EVENT_SQL, [
      `control-${kind}`, `control-${kind}`, 'desktop-a', RELATION_REVIEW_SCENARIO.nodeId, 0, '',
      '2026-10-05T02:00:00.000Z', kind, kind === 'void' ? RELATION_REVIEW_SCENARIO.reviewOpId : null
    ]);
    recomputeNodeReview(driver, RELATION_REVIEW_SCENARIO.nodeId);
    return;
  }
  if (role === 'review_only') { insertReview(3); return; }
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

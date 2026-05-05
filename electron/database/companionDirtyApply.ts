import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type { NativeCompanionDirtyNodePayload } from '../../lib/platform/nativeCompanionSyncContract.js';

import {
  prepareCompanionDirtyApplyStatements,
  type CompanionDirtyApplyStatements
} from './companionDirtyApplyStatements.js';
import { openDatabaseConnection } from './connection.js';
import { loadSyncNodes } from './syncNodes.js';

interface LocalNodeMetaRow extends DatabaseRow {
  id: string;
  last_modified_by_device_id: string | null;
  updated_at: string;
}

interface AppliedCompanionDirtyNode {
  currentVersionId: string | null;
  deviceId: string;
  objectId: string;
  snapshot: NativeCompanionDirtyNodePayload['nodes'][number]['snapshot'];
  position: number | null;
}

function serializeJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function loadLocalNodeMeta(objectIds: string[]) {
  if (objectIds.length === 0) {
    return new Map<string, LocalNodeMetaRow>();
  }
  const placeholders = objectIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<LocalNodeMetaRow>(
    `SELECT id, last_modified_by_device_id, updated_at
     FROM nodes
     WHERE id IN (${placeholders})`,
    objectIds
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function shouldApplyDirtyNode(
  localMeta: LocalNodeMetaRow | undefined,
  lastSyncedAt: string | null,
  remoteDeviceId: string
) {
  if (!localMeta) {
    return true;
  }
  if (!lastSyncedAt) {
    return false;
  }
  if (localMeta.updated_at <= lastSyncedAt) {
    return true;
  }
  return localMeta.last_modified_by_device_id === remoteDeviceId;
}

function orderNodesForApply(records: AppliedCompanionDirtyNode[]) {
  const byId = new Map(records.map((record) => [record.objectId, record]));
  const ordered: AppliedCompanionDirtyNode[] = [];
  const visited = new Set<string>();

  function visit(record: AppliedCompanionDirtyNode) {
    if (visited.has(record.objectId)) {
      return;
    }
    const parentId = record.snapshot.parentNodeId;
    if (parentId) {
      const parent = byId.get(parentId);
      if (parent) {
        visit(parent);
      }
    }
    visited.add(record.objectId);
    ordered.push(record);
  }

  for (const record of records) {
    visit(record);
  }
  return ordered;
}

function collectDirtyNodeIds(payload: NativeCompanionDirtyNodePayload) {
  return [...new Set(payload.nodes.map((node) => node.object_id))];
}

function classifyDirtyNodes(payload: NativeCompanionDirtyNodePayload) {
  const objectIds = collectDirtyNodeIds(payload);
  const localNodes = new Map(loadSyncNodes(objectIds).map((node) => [node.object_id, node]));
  const localMeta = loadLocalNodeMeta(objectIds);
  const applied: AppliedCompanionDirtyNode[] = [];
  const conflictObjectIds: string[] = [];

  for (const node of payload.nodes) {
    const localNode = localNodes.get(node.object_id);
    if (!shouldApplyDirtyNode(localMeta.get(node.object_id), payload.last_synced_at, node.device_id)) {
      conflictObjectIds.push(node.object_id);
      continue;
    }
    applied.push({
      currentVersionId: localNode?.version_id ?? null,
      deviceId: node.device_id,
      objectId: node.object_id,
      position: localNode?.snapshot.position ?? null,
      snapshot: node.snapshot
    });
  }
  return { applied, conflictObjectIds };
}

function upsertDirtyNodeBase(
  statements: CompanionDirtyApplyStatements,
  record: AppliedCompanionDirtyNode
) {
  const { snapshot } = record;
  statements.upsertNode.run([
    record.objectId,
    snapshot.parentNodeId,
    snapshot.kind,
    snapshot.priority ?? null,
    snapshot.desiredRetention ?? null,
    snapshot.title,
    snapshot.isTitleManual ? 1 : 0,
    snapshot.hideTitleHeading ? 1 : 0,
    snapshot.content,
    snapshot.openingText ?? null,
    serializeJson(snapshot.virtualFilter),
    snapshot.reveal,
    serializeJson(snapshot.anchorLink),
    serializeJson(snapshot.imageRegions),
    record.position,
    record.currentVersionId,
    record.deviceId,
    snapshot.createdAt,
    snapshot.updatedAt,
    null
  ]);
  if (typeof record.position === 'number') {
    statements.upsertNodeOrder.run([record.objectId, record.position]);
  }
}

function upsertDirtyNodeProfiles(
  statements: CompanionDirtyApplyStatements,
  record: AppliedCompanionDirtyNode
) {
  const { snapshot } = record;
  if (snapshot.reading) {
    statements.upsertReading.run([
      record.objectId,
      snapshot.reading.intervalDurationMs,
      snapshot.reading.intervalGrowthFactor,
      snapshot.reading.lastHandledAt,
      snapshot.reading.nextAt,
      snapshot.reading.priority,
      snapshot.reading.readingPosition,
      snapshot.reading.repetitionCount,
      snapshot.reading.state
    ]);
  } else {
    statements.deleteReading.run([record.objectId]);
  }
  if (snapshot.review) {
    statements.upsertReview.run([
      record.objectId,
      snapshot.review.due,
      snapshot.review.lastReviewAt,
      snapshot.review.state,
      snapshot.review.stability,
      snapshot.review.difficulty,
      snapshot.review.elapsedDays,
      snapshot.review.scheduledDays,
      snapshot.review.reps,
      snapshot.review.lapses
    ]);
    return;
  }
  statements.deleteReview.run([record.objectId]);
}

function applyDirtyNodeRecord(
  statements: CompanionDirtyApplyStatements,
  record: AppliedCompanionDirtyNode
) {
  upsertDirtyNodeBase(statements, record);
  upsertDirtyNodeProfiles(statements, record);
}

function persistDirtyNodes(records: AppliedCompanionDirtyNode[]) {
  const statements = prepareCompanionDirtyApplyStatements();
  const ordered = orderNodesForApply(records);

  statements.connection.driver.transaction(() => {
    for (const record of ordered) {
      applyDirtyNodeRecord(statements, record);
    }
    syncWorkspaceSearchIndexForNodeIds(statements.connection.driver, ordered.map((record) => record.objectId));
  });

  return ordered.map((record) => record.objectId);
}

export function applyCompanionDirtyNodes(payload: NativeCompanionDirtyNodePayload) {
  const { applied, conflictObjectIds } = classifyDirtyNodes(payload);
  if (applied.length === 0) {
    return {
      appliedObjectIds: [],
      conflictObjectIds
    };
  }

  return {
    appliedObjectIds: persistDirtyNodes(applied),
    conflictObjectIds
  };
}

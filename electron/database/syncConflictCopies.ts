import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import {
  conflictCopyBranchKey,
  conflictCopyNodeId
} from './syncConflictCopyIdentity.js';
import { upsertConflictCopyProjection } from './syncConflictCopyProjection.js';
import {
  loadConflictCopyBranchMapping,
  loadConflictCopyMapping,
  saveConflictCopyBranchMapping,
  saveConflictCopyMapping
} from './syncConflictCopyMappings.js';
import { recordRemoteNodeConflict } from './syncNodeConflictRecords.js';

interface ConflictCopyResult {
  copyNodeId: string | null;
  shouldRecordConflict: boolean;
}

export function recordNodeConflictAndCreateCopy(args: {
  driver: DatabaseDriver;
  record: NativeSyncNodeRecord;
  timestamp: string;
}) {
  if (!args.record.version_id) {
    return null;
  }
  const result = createNodeConflictCopy(args);
  if (result.shouldRecordConflict) {
    recordRemoteNodeConflict(args.driver, args.record, args.timestamp);
  }
  return result.copyNodeId;
}

function isStaleBranchHead(record: NativeSyncNodeRecord, mappedCreatedAt: string | null, mappedVersionId: string | null) {
  if (!mappedCreatedAt) {
    return false;
  }
  const createdAt = record.version_created_at ?? record.updated_at ?? '';
  const createdAtCompare = createdAt.localeCompare(mappedCreatedAt);
  if (createdAtCompare !== 0) {
    return createdAtCompare < 0;
  }
  return (record.version_id ?? '').localeCompare(mappedVersionId ?? '') <= 0;
}

export function createNodeConflictCopy(args: {
  driver: DatabaseDriver;
  record: NativeSyncNodeRecord;
  timestamp: string;
}): ConflictCopyResult {
  if (!args.record.version_id) {
    return { copyNodeId: null, shouldRecordConflict: false };
  }
  const conflictVersionId = args.record.version_id;
  const mappedCopyNodeId = loadConflictCopyMapping(args.driver, conflictVersionId);
  if (mappedCopyNodeId) {
    return {
      copyNodeId: args.driver.queryOne('SELECT id FROM nodes WHERE id = ?', [mappedCopyNodeId]) ? mappedCopyNodeId : null,
      shouldRecordConflict: false
    };
  }
  const branchKey = conflictCopyBranchKey(args.record);
  const mappedBranchCopyNodeId = loadConflictCopyBranchMapping(
    args.driver,
    branchKey.objectId,
    branchKey.sourceDeviceId
  );
  if (
    mappedBranchCopyNodeId &&
    !args.driver.queryOne('SELECT id FROM nodes WHERE id = ?', [mappedBranchCopyNodeId.copyNodeId])
  ) {
    saveConflictCopyMapping(args.driver, conflictVersionId, mappedBranchCopyNodeId.copyNodeId, args.timestamp);
    return { copyNodeId: null, shouldRecordConflict: false };
  }
  if (
    mappedBranchCopyNodeId &&
    isStaleBranchHead(args.record, mappedBranchCopyNodeId.sourceVersionCreatedAt, mappedBranchCopyNodeId.sourceVersionId)
  ) {
    saveConflictCopyMapping(args.driver, conflictVersionId, mappedBranchCopyNodeId.copyNodeId, args.timestamp);
    return { copyNodeId: mappedBranchCopyNodeId.copyNodeId, shouldRecordConflict: false };
  }
  const copyNodeId = mappedBranchCopyNodeId?.copyNodeId ?? conflictCopyNodeId(args.record);
  const existing = args.driver.queryOne('SELECT id FROM nodes WHERE id = ?', [copyNodeId]);
  upsertConflictCopyProjection({
    copyNodeId,
    driver: args.driver,
    placeAtTop: !existing,
    record: args.record,
    sourceVersionId: conflictVersionId,
    timestamp: args.timestamp
  });
  saveConflictCopyBranchMapping(
    args.driver,
    branchKey.objectId,
    branchKey.sourceDeviceId,
    copyNodeId,
    args.timestamp,
    conflictVersionId,
    args.record.version_created_at ?? args.record.updated_at ?? null
  );
  saveConflictCopyMapping(args.driver, conflictVersionId, copyNodeId, args.timestamp);
  return { copyNodeId, shouldRecordConflict: true };
}

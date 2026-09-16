import type {
  LegacyReadwiseSourceCutover,
  ReadwiseSourceCutoverActiveDocument,
  ReadwiseSourceCutover,
  ReadwiseSourceCutoverClassification,
  ReadwiseSourceCutoverClassificationStatus,
  ReadwiseSourceCutoverFailure,
  ReadwiseSourceCutoverFailureStage,
  ReadwiseSourceCutoverLegacyMatch,
  ReadwiseSourceCutoverStatus,
  StoredReadwiseSourceCutover
} from './readwiseSourceCutover.js';

export function normalizeStoredReadwiseSourceCutover(
  value: unknown,
  version: number,
  completionVersion: number
): StoredReadwiseSourceCutover | null {
  if (value === null || value === undefined) return null;
  const payload = record(value, 'payload');
  if (payload.version === 1) return normalizeLegacy(payload);
  if (payload.version !== version) {
    throw new Error(`readwise_source_cutover_unknown_version:${String(payload.version)}`);
  }
  const documents = classifications(payload.documents, 'documents');
  const cohortDocumentIds = uniqueStrings(payload.cohortDocumentIds, 'cohortDocumentIds');
  const state: ReadwiseSourceCutover = {
    ...(payload.activeDocument === undefined
      ? {} : { activeDocument: activeDocument(payload.activeDocument) }),
    annotations: classifications(payload.annotations, 'annotations'),
    ...(optionalText(payload.batchId) ? { batchId: optionalText(payload.batchId)! } : {}),
    cohortDocumentIds,
    ...((payload.completionVersion === 2 || payload.completionVersion === completionVersion)
      ? { completionVersion: payload.completionVersion } : {}),
    completedAt: text(payload.completedAt, 'completedAt'),
    documents,
    ...(optionalText(payload.errorReason) ? { errorReason: optionalText(payload.errorReason)! } : {}),
    ...(payload.failures === undefined ? {} : { failures: cutoverFailures(payload.failures) }),
    ...(payload.legacyMatches === undefined ? {} : { legacyMatches: legacyMatches(payload.legacyMatches) }),
    ...(payload.legacyTotal === undefined ? {} : { legacyTotal: integer(payload.legacyTotal, 'legacyTotal') }),
    ...(payload.updateDocumentIds === undefined ? {} : { updateDocumentIds: uniqueStrings(payload.updateDocumentIds, 'updateDocumentIds') }),
    phase: cutoverPhase(payload.phase, payload.status),
    retiredNodeIds: uniqueStrings(payload.retiredNodeIds, 'retiredNodeIds'),
    sourceHost: text(payload.sourceHost, 'sourceHost'),
    startedAt: text(payload.startedAt, 'startedAt'),
    status: status(payload.status),
    ...(payload.unmatchedLegacy === undefined
      ? {} : { unmatchedLegacy: legacyFailures(payload.unmatchedLegacy) }),
    version: 2
  };
  const classifiedDocumentIds = new Set(documents.map((item) => item.remoteId));
  if (state.status === 'api' && cohortDocumentIds.some((id) => !classifiedDocumentIds.has(id))) {
    throw new Error('readwise_source_cutover_incomplete_cohort');
  }
  return state;
}

function activeDocument(value: unknown): ReadwiseSourceCutoverActiveDocument {
  const row = record(value, 'activeDocument');
  const stage = failureStage(row.stage, 'activeDocument.stage');
  return {
    remoteId: text(row.remoteId, 'activeDocument.remoteId'),
    stage,
    startedAt: text(row.startedAt, 'activeDocument.startedAt'),
    title: text(row.title, 'activeDocument.title')
  };
}

function legacyMatches(value: unknown): ReadwiseSourceCutoverLegacyMatch[] {
  if (!Array.isArray(value)) throw new Error('readwise_source_cutover_invalid:legacyMatches');
  const matches = value.map((item, index) => {
    const row = record(item, `legacyMatches.${index}`);
    return {
      nodeId: text(row.nodeId, `legacyMatches.${index}.nodeId`),
      remoteId: text(row.remoteId, `legacyMatches.${index}.remoteId`)
    };
  });
  assertUnique(matches.map((item) => item.nodeId), 'legacyMatches');
  assertUnique(matches.map((item) => item.remoteId), 'legacyMatches');
  return matches;
}

function cutoverFailures(value: unknown): ReadwiseSourceCutoverFailure[] {
  if (!Array.isArray(value)) throw new Error('readwise_source_cutover_invalid:failures');
  const failures = value.map((item, index) => {
    const row = record(item, `failures.${index}`);
    const stage = failureStage(row.stage, `failures.${index}.stage`);
    return {
      reason: text(row.reason, `failures.${index}.reason`),
      remoteId: text(row.remoteId, `failures.${index}.remoteId`),
      stage,
      title: text(row.title, `failures.${index}.title`)
    };
  });
  assertUnique(failures.map((item) => item.remoteId), 'failures');
  return failures;
}

function failureStage(value: unknown, name: string): ReadwiseSourceCutoverFailureStage {
  if (value === 'preparing' || value === 'resources' || value === 'writing' || value === 'recording') {
    return value;
  }
  throw new Error(`readwise_source_cutover_invalid:${name}`);
}

function legacyFailures(value: unknown) {
  if (!Array.isArray(value)) throw new Error('readwise_source_cutover_invalid:unmatchedLegacy');
  const failures = value.map((item, index) => {
    const row = record(item, `unmatchedLegacy.${index}`);
    return {
      nodeId: text(row.nodeId, `unmatchedLegacy.${index}.nodeId`),
      reason: text(row.reason, `unmatchedLegacy.${index}.reason`)
    };
  });
  assertUnique(failures.map((item) => item.nodeId), 'unmatchedLegacy');
  return failures;
}

function normalizeLegacy(payload: Record<string, unknown>): LegacyReadwiseSourceCutover {
  const completedAt = text(payload.completedAt, 'completedAt');
  const statusValue = payload.status === undefined ? 'api' : status(payload.status);
  return {
    completedAt,
    completedCandidateCount: integer(
      payload.completedCandidateCount ?? (statusValue === 'api' ? payload.migratedCount : 0),
      'completedCandidateCount'
    ),
    migratedCount: integer(payload.migratedCount, 'migratedCount'),
    sourceHost: text(payload.sourceHost, 'sourceHost'),
    startedAt: payload.startedAt === undefined ? completedAt : text(payload.startedAt, 'startedAt'),
    status: statusValue,
    totalCandidateCount: payload.totalCandidateCount === undefined || payload.totalCandidateCount === null
      ? null : integer(payload.totalCandidateCount, 'totalCandidateCount'),
    unmatchedCount: integer(payload.unmatchedCount, 'unmatchedCount'),
    version: 1
  };
}

function classifications(value: unknown, name: string): ReadwiseSourceCutoverClassification[] {
  if (!Array.isArray(value)) throw new Error(`readwise_source_cutover_invalid:${name}`);
  const result = value.map((item, index): ReadwiseSourceCutoverClassification => {
    const row = record(item, `${name}.${index}`);
    const itemStatus = row.status;
    if (!isClassificationStatus(itemStatus)) {
      throw new Error(`readwise_source_cutover_invalid:${name}.${index}.status`);
    }
    const requiresNode = itemStatus === 'bound' || itemStatus === 'materialized';
    const allowsNode = requiresNode || itemStatus === 'blocked';
    const nodeId = row.nodeId === null ? null : text(row.nodeId, `${name}.${index}.nodeId`);
    if (requiresNode && !nodeId || !allowsNode && nodeId) {
      throw new Error(`readwise_source_cutover_invalid:${name}.${index}.nodeId`);
    }
    const reason = optionalText(row.reason);
    return {
      nodeId,
      ...(reason ? { reason } : {}),
      remoteId: text(row.remoteId, `${name}.${index}.remoteId`),
      status: itemStatus
    };
  });
  assertUnique(result.map((item) => item.remoteId), name);
  return result;
}

function isClassificationStatus(value: unknown): value is ReadwiseSourceCutoverClassificationStatus {
  return value === 'blocked' || value === 'bound' || value === 'external'
    || value === 'materialized' || value === 'suppressed' || value === 'unavailable';
}

function uniqueStrings(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`readwise_source_cutover_invalid:${name}`);
  const result = value.map((item, index) => text(item, `${name}.${index}`));
  assertUnique(result, name);
  return result;
}

function assertUnique(values: string[], name: string) {
  if (new Set(values).size !== values.length) throw new Error(`readwise_source_cutover_duplicate:${name}`);
}

function record(value: unknown, name: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`readwise_source_cutover_invalid:${name}`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`readwise_source_cutover_invalid:${name}`);
  }
  return Math.floor(value);
}

function status(value: unknown): ReadwiseSourceCutoverStatus {
  if (value !== 'api' && value !== 'migration-in-progress') {
    throw new Error('readwise_source_cutover_invalid:status');
  }
  return value;
}

function cutoverPhase(value: unknown, storedStatus: unknown) {
  if (storedStatus === 'api') return null;
  if (value === 'indexing' || value === 'merging') return value;
  return 'indexing' as const;
}

function text(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`readwise_source_cutover_invalid:${name}`);
  return value;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

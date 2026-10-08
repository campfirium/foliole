import type { PersistedImportRecord, PreparedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { filterImportHighlightsWithinBudget } from './importHighlightTextBudget.js';
import { resolveAnchoredImport } from './importPipelineAnchoring.js';
import {
  hasLandedImportEvidence,
  type ExistingNodeRow,
  type ImportSourceRow,
  resolveExistingImportTarget
} from './importPipelineExistingTarget.js';
import { persistImportedHighlightNodes } from './importPipelineHighlightPersistence.js';
import { updateExistingNode, writeNewNode } from './importPipelineNodes.js';
import { establishImportedNodeIdentity } from './importPipelineProvenance.js';
import {
  buildImportRecord,
  resolveDuplicateSemantic,
  writeImportEvent,
  writeImportSource
} from './importPipelineRecords.js';
import { updateExistingReadwiseNode } from './importReadwiseHighlightBackfill.js';

export interface RunPreparedImportOptions {
  prepareDeletionVersions?: (nodeIds: string[], deletedAt: string) => void;
  ambiguityPolicy?: 'first' | 'unique';
  forceUpdateExistingNodeId?: string;
  preserveExistingHighlightNodes?: boolean;
  resetImportedStructure?: boolean;
}

function finalizeImportRecord(driver: DatabaseDriver, record: PersistedImportRecord) {
  writeImportSource(driver, record);
  writeImportEvent(driver, record);
  return record;
}

function buildBaseImportRecord(
  existingSource: ImportSourceRow | null,
  existingNode: ExistingNodeRow | null,
  prepared: PreparedImportRecord,
  options: { forceUpdateExisting: boolean; hasLandedEvidence: boolean }
): { baseRecord: PersistedImportRecord; duplicateSemantic: PersistedImportRecord['duplicateSemantic'] } {
  const duplicateSemantic = options.forceUpdateExisting
    ? 'updated'
    : resolveDuplicateSemantic(
        existingSource,
        existingNode,
        prepared.sourceFingerprint,
        prepared.contentFingerprint,
        options.hasLandedEvidence
      );
  return {
    baseRecord: buildImportRecord(prepared, prepared.degradedReason ? 'degraded' : 'imported', duplicateSemantic, {
      degradedReason: prepared.degradedReason,
      failureReason: null,
      nodeId: duplicateSemantic === 'new' ? null : existingNode?.id ?? existingSource?.latest_node_id ?? null
    }),
    duplicateSemantic
  };
}

function resolvePreparedNodeId(input: {
  anchoredContent: string;
  baseRecord: PersistedImportRecord;
  driver: DatabaseDriver;
  duplicateSemantic: PersistedImportRecord['duplicateSemantic'];
  existingNode: ExistingNodeRow | null;
  prepared: PreparedImportRecord;
  resetImportedStructure: boolean;
  budgetFailures: string[];
}) {
  if (input.duplicateSemantic === 'updated' && input.existingNode && !input.existingNode.deleted_at) {
    if (input.prepared.sourceProfile === 'body_with_highlight_sidecar' && !input.resetImportedStructure) {
      return updateExistingReadwiseNode({
        driver: input.driver,
        existingNode: input.existingNode,
        hideTitleHeading: input.prepared.hideTitleHeading,
        importedAt: input.baseRecord.importedAt,
        prepared: input.prepared, budgetFailures: input.budgetFailures
      });
    }
    return updateExistingNode({
      content: input.anchoredContent,
      driver: input.driver,
      existingNode: input.existingNode,
      hideTitleHeading: input.prepared.hideTitleHeading,
      importedAt: input.baseRecord.importedAt,
      title: input.prepared.nodeTitle, budgetFailures: input.budgetFailures
    });
  }
  return writeNewNode({
    content: input.anchoredContent,
    driver: input.driver,
    hideTitleHeading: input.prepared.hideTitleHeading,
    importedAt: input.baseRecord.importedAt,
    ...(input.prepared.targetParentNodeId === undefined ? {} : { targetParentNodeId: input.prepared.targetParentNodeId }),
    title: input.prepared.nodeTitle, budgetFailures: input.budgetFailures
  });
}

function finalizeDuplicateImport(driver: DatabaseDriver, prepared: PreparedImportRecord,
  existingNode: ExistingNodeRow | null, baseRecord: PersistedImportRecord, budgetFailures: string[]) {
  if (prepared.sourceProfile === 'body_with_highlight_sidecar' && existingNode && !existingNode.deleted_at) {
    updateExistingReadwiseNode({ driver, existingNode,
      hideTitleHeading: prepared.hideTitleHeading, importedAt: baseRecord.importedAt, prepared, budgetFailures
    });
  }
  if (!baseRecord.nodeId) throw new Error('duplicate_import_node_missing');
  establishImportedNodeIdentity(driver, baseRecord, baseRecord.nodeId);
  return finalizeImportRecord(driver, withAnnotationFailures(baseRecord, budgetFailures));
}

function withAnnotationFailures(record: PersistedImportRecord, failures: string[]): PersistedImportRecord {
  if (!failures.length) return record;
  return { ...record, resultStatus: 'degraded',
    degradedReason: [record.degradedReason, ...new Set(failures)].filter(Boolean).join('; ') };
}

function performPreparedImport(driver: DatabaseDriver, prepared: PreparedImportRecord, options: RunPreparedImportOptions) {
  const budgetFailures: string[] = [];
  const rejectedHighlights = options.preserveExistingHighlightNodes ? [] : filterImportHighlightsWithinBudget(
    [...(prepared.matchedHighlights ?? []), ...(prepared.unmatchedHighlights ?? [])], prepared.content, budgetFailures
  ).rejected;
  if (rejectedHighlights.length) {
    const rejected = new Set(rejectedHighlights);
    prepared = { ...prepared,
      ...(prepared.matchedHighlights ? { matchedHighlights: prepared.matchedHighlights.filter(highlight => !rejected.has(highlight)) } : {}),
      ...(prepared.unmatchedHighlights ? { unmatchedHighlights: prepared.unmatchedHighlights.filter(highlight => !rejected.has(highlight)) } : {}) };
  }
  const { existingNode, existingSource, forceUpdateExisting } = resolveExistingImportTarget(
    driver,
    prepared,
    options.forceUpdateExistingNodeId
  );
  const { baseRecord, duplicateSemantic } = buildBaseImportRecord(existingSource, existingNode, prepared, {
    forceUpdateExisting,
    hasLandedEvidence: existingNode
      ? hasLandedImportEvidence(driver, existingNode.id, prepared)
      : false
  });
  if (duplicateSemantic === 'duplicate') {
    return finalizeDuplicateImport(driver, prepared, existingNode, baseRecord, budgetFailures);
  }
  if (prepared.content.trim().length === 0) {
    return finalizeImportRecord(driver, withAnnotationFailures({
      ...baseRecord,
      degradedReason: prepared.degradedReason ?? 'empty_content',
      resultStatus: 'degraded'
    }, budgetFailures));
  }
  const anchoredImport = resolveAnchoredImport(prepared, options);
  const nodeId = resolvePreparedNodeId({
    anchoredContent: anchoredImport.content,
    baseRecord,
    driver,
    duplicateSemantic,
    existingNode,
    prepared,
    resetImportedStructure: Boolean(options.resetImportedStructure), budgetFailures
  });
  persistImportedHighlightNodes({
    anchoredContent: anchoredImport.content,
    driver,
    duplicateSemantic,
    importedAt: baseRecord.importedAt,
    ...(options.prepareDeletionVersions ? { prepareDeletionVersions: options.prepareDeletionVersions } : {}),
    matchedAnchoredHighlights: anchoredImport.highlights, rejectedHighlights,
    nodeId,
    prepared,
    preserveExistingHighlightNodes: Boolean(options.preserveExistingHighlightNodes),
    resetImportedStructure: Boolean(options.resetImportedStructure), budgetFailures
  });
  establishImportedNodeIdentity(driver, baseRecord, nodeId);
  return finalizeImportRecord(driver, withAnnotationFailures({ ...baseRecord, nodeId }, budgetFailures));
}

export function runPreparedImport(
  driver: DatabaseDriver,
  prepared: PreparedImportRecord,
  options: RunPreparedImportOptions = {}
): PersistedImportRecord {
  return driver.transaction(() => performPreparedImport(driver, prepared, options));
}

export function recordPreparedImportFailure(
  driver: DatabaseDriver,
  prepared: PreparedImportRecord,
  failureReason: string
): PersistedImportRecord {
  return driver.transaction(() => {
    const { existingNode, existingSource } = resolveExistingImportTarget(driver, prepared, undefined);
    const duplicateSemantic = resolveDuplicateSemantic(
      existingSource,
      existingNode,
      prepared.sourceFingerprint,
      prepared.contentFingerprint,
      Boolean(existingNode && hasLandedImportEvidence(driver, existingNode.id, prepared))
    );
    const failedRecord = buildImportRecord(prepared, 'failed', duplicateSemantic, {
      degradedReason: null,
      failureReason,
      nodeId: duplicateSemantic === 'new' ? null : existingNode?.id ?? existingSource?.latest_node_id ?? null
    });
    writeImportSource(driver, failedRecord);
    writeImportEvent(driver, failedRecord);
    return failedRecord;
  });
}

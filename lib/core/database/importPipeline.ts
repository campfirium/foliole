import type { PersistedImportRecord, PreparedImportRecord } from '../import/contract.js';
import type { PreparedImportHighlightRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';
import {
  hasLandedImportEvidence,
  type ExistingNodeRow,
  type ImportSourceRow,
  resolveExistingImportTarget
} from './importPipelineExistingTarget.js';
import { replaceImportedHighlightNodes } from './importPipelineHighlightNodes.js';
import { updateExistingNode, writeNewNode } from './importPipelineNodes.js';
import { establishImportedNodeIdentity } from './importPipelineProvenance.js';
import {
  buildImportRecord,
  resolveDuplicateSemantic,
  writeImportEvent,
  writeImportSource
} from './importPipelineRecords.js';
import { updateExistingReadwiseNode } from './importReadwiseHighlightBackfill.js';
import { resolveReadwiseHighlightUpdate } from './importReadwiseHighlightUpdates.js';

export interface RunPreparedImportOptions {
  forceUpdateExistingNodeId?: string;
  resetImportedStructure?: boolean;
}

function persistImportedHighlightNodes(input: {
  anchoredContent: string;
  driver: DatabaseDriver;
  duplicateSemantic: PersistedImportRecord['duplicateSemantic'];
  importedAt: string;
  nodeId: string;
  prepared: PreparedImportRecord;
  resetImportedStructure: boolean;
  matchedAnchoredHighlights: Array<PreparedImportHighlightRecord | ReturnType<typeof applyImportedHighlightAnchors>['highlights'][number]>;
}) {
  if (input.prepared.sourceProfile !== 'body_with_highlight_sidecar' || input.resetImportedStructure) {
    replaceImportedHighlightNodes({
      driver: input.driver,
      highlights: input.matchedAnchoredHighlights as ReturnType<typeof applyImportedHighlightAnchors>['highlights'],
      importedAt: input.importedAt,
      parentNodeId: input.nodeId,
      parentContent: input.anchoredContent
    });
    return;
  }
  if (input.duplicateSemantic !== 'new') {
    return;
  }
  insertImportedHighlightNodes({
    driver: input.driver,
    highlights: input.matchedAnchoredHighlights,
    importedAt: input.importedAt,
    parentNodeId: input.nodeId,
    parentContent: input.anchoredContent
  });
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
}) {
  if (input.duplicateSemantic === 'updated' && input.existingNode && !input.existingNode.deleted_at) {
    if (input.prepared.sourceProfile === 'body_with_highlight_sidecar' && !input.resetImportedStructure) {
      return updateExistingReadwiseNode({
        driver: input.driver,
        existingNode: input.existingNode,
        hideTitleHeading: input.prepared.hideTitleHeading,
        importedAt: input.baseRecord.importedAt,
        prepared: input.prepared
      });
    }
    return updateExistingNode({
      content: input.anchoredContent,
      driver: input.driver,
      existingNode: input.existingNode,
      hideTitleHeading: input.prepared.hideTitleHeading,
      importedAt: input.baseRecord.importedAt,
      title: input.prepared.nodeTitle
    });
  }
  return writeNewNode({
    content: input.anchoredContent,
    driver: input.driver,
    hideTitleHeading: input.prepared.hideTitleHeading,
    importedAt: input.baseRecord.importedAt,
    ...(input.prepared.targetParentNodeId === undefined ? {} : { targetParentNodeId: input.prepared.targetParentNodeId }),
    title: input.prepared.nodeTitle
  });
}

function performPreparedImport(driver: DatabaseDriver, prepared: PreparedImportRecord, options: RunPreparedImportOptions) {
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
    if (prepared.sourceProfile === 'body_with_highlight_sidecar' && existingNode && !existingNode.deleted_at) {
      updateExistingReadwiseNode({
        driver,
        existingNode,
        hideTitleHeading: prepared.hideTitleHeading,
        importedAt: baseRecord.importedAt,
        prepared
      });
    }
    if (!baseRecord.nodeId) {
      throw new Error('duplicate_import_node_missing');
    }
    establishImportedNodeIdentity(driver, baseRecord, baseRecord.nodeId);
    return finalizeImportRecord(driver, baseRecord);
  }
  if (prepared.content.trim().length === 0) {
    return finalizeImportRecord(driver, {
      ...baseRecord,
      degradedReason: prepared.degradedReason ?? 'empty_content',
      resultStatus: 'degraded'
    });
  }
  const anchoredImport = prepared.sourceProfile === 'body_with_highlight_sidecar'
    ? resolveReadwiseHighlightUpdate({ existingChildContents: [], existingContent: prepared.content, prepared })
    : applyImportedHighlightAnchors({ content: prepared.content, highlights: prepared.matchedHighlights });
  const nodeId = resolvePreparedNodeId({
    anchoredContent: anchoredImport.content,
    baseRecord,
    driver,
    duplicateSemantic,
    existingNode,
    prepared,
    resetImportedStructure: Boolean(options.resetImportedStructure)
  });
  persistImportedHighlightNodes({
    anchoredContent: anchoredImport.content,
    driver,
    duplicateSemantic,
    importedAt: baseRecord.importedAt,
    matchedAnchoredHighlights: anchoredImport.highlights,
    nodeId,
    prepared,
    resetImportedStructure: Boolean(options.resetImportedStructure)
  });
  establishImportedNodeIdentity(driver, baseRecord, nodeId);
  return finalizeImportRecord(driver, { ...baseRecord, nodeId });
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
    const { existingNode, existingSource } = resolveExistingImportTarget(driver, prepared);
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

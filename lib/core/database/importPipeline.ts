import type { PersistedImportRecord, PreparedImportRecord } from '../import/contract.js';
import type { PreparedImportHighlightRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';
import { readExistingChildHighlights, replaceImportedHighlightNodes } from './importPipelineHighlightNodes.js';
import { updateExistingNode, writeNewNode } from './importPipelineNodes.js';
import {
  buildImportRecord,
  resolveDuplicateSemantic,
  writeImportEvent,
  writeImportSource
} from './importPipelineRecords.js';
import { resolveReadwiseHighlightUpdate } from './importReadwiseHighlightUpdates.js';

interface ImportSourceRow {
  [column: string]: unknown;
  latest_node_id: string | null;
  last_content_fingerprint: string;
}

interface ExistingNodeRow {
  [column: string]: unknown;
  content: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  parent_id: string | null;
}

function readExistingSource(driver: DatabaseDriver, sourceFingerprint: string) {
  return (
    driver.queryOne<ImportSourceRow>(
      `SELECT latest_node_id, last_content_fingerprint
       FROM import_sources
       WHERE source_fingerprint = ?`,
      [sourceFingerprint]
    ) ?? null
  );
}

function readExistingNode(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<ExistingNodeRow>(
      `SELECT n.id, n.parent_id, n.content, n.created_at, n.deleted_at
       FROM nodes n
       WHERE n.id = ?`,
      [nodeId]
    ) ?? null
  );
}

function updateExistingReadwiseNode(
  driver: DatabaseDriver,
  existingNode: ExistingNodeRow,
  prepared: PreparedImportRecord,
  record: PersistedImportRecord
) {
  const readwiseUpdate = resolveReadwiseHighlightUpdate({
    existingChildContents: readExistingChildHighlights(driver, existingNode.id).map((row) => row.content),
    existingContent: existingNode.content,
    prepared
  });
  const nodeId = updateExistingNode({
    content: readwiseUpdate.content,
    driver,
    existingNode,
    hideTitleHeading: prepared.hideTitleHeading,
    importedAt: record.importedAt,
    title: prepared.nodeTitle
  });
  if (readwiseUpdate.highlights.length > 0) {
    insertImportedHighlightNodes({
      driver,
      highlights: readwiseUpdate.highlights,
      importedAt: record.importedAt,
      parentNodeId: nodeId,
      parentContent: readwiseUpdate.content
    });
  }
  return nodeId;
}

function persistImportedHighlightNodes(input: {
  anchoredContent: string;
  driver: DatabaseDriver;
  duplicateSemantic: PersistedImportRecord['duplicateSemantic'];
  importedAt: string;
  nodeId: string;
  prepared: PreparedImportRecord;
  matchedAnchoredHighlights: Array<PreparedImportHighlightRecord | ReturnType<typeof applyImportedHighlightAnchors>['highlights'][number]>;
}) {
  if (input.prepared.sourceProfile !== 'body_with_highlight_sidecar') {
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
  prepared: PreparedImportRecord
): { baseRecord: PersistedImportRecord; duplicateSemantic: PersistedImportRecord['duplicateSemantic'] } {
  const duplicateSemantic = resolveDuplicateSemantic(existingSource, existingNode, prepared.contentFingerprint);
  return {
    baseRecord: buildImportRecord(prepared, prepared.degradedReason ? 'degraded' : 'imported', duplicateSemantic, {
      degradedReason: prepared.degradedReason,
      failureReason: null,
      nodeId: duplicateSemantic === 'new' ? null : existingSource?.latest_node_id ?? null
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
}) {
  if (input.duplicateSemantic === 'updated' && input.existingNode && !input.existingNode.deleted_at) {
    if (input.prepared.sourceProfile === 'body_with_highlight_sidecar') {
      return updateExistingReadwiseNode(input.driver, input.existingNode, input.prepared, input.baseRecord);
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
    title: input.prepared.nodeTitle
  });
}

function performPreparedImport(driver: DatabaseDriver, prepared: PreparedImportRecord) {
  const existingSource = readExistingSource(driver, prepared.sourceFingerprint);
  const existingNode = existingSource?.latest_node_id ? readExistingNode(driver, existingSource.latest_node_id) : null;
  const { baseRecord, duplicateSemantic } = buildBaseImportRecord(existingSource, existingNode, prepared);
  if (duplicateSemantic === 'duplicate') {
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
    prepared
  });
  persistImportedHighlightNodes({
    anchoredContent: anchoredImport.content,
    driver,
    duplicateSemantic,
    importedAt: baseRecord.importedAt,
    matchedAnchoredHighlights: anchoredImport.highlights,
    nodeId,
    prepared
  });
  return finalizeImportRecord(driver, { ...baseRecord, nodeId });
}

export function runPreparedImport(driver: DatabaseDriver, prepared: PreparedImportRecord): PersistedImportRecord {
  return driver.transaction(() => performPreparedImport(driver, prepared));
}

export function recordPreparedImportFailure(
  driver: DatabaseDriver,
  prepared: PreparedImportRecord,
  failureReason: string
): PersistedImportRecord {
  return driver.transaction(() => {
    const existingSource = readExistingSource(driver, prepared.sourceFingerprint);
    const existingNode = existingSource?.latest_node_id ? readExistingNode(driver, existingSource.latest_node_id) : null;
    const duplicateSemantic = resolveDuplicateSemantic(existingSource, existingNode, prepared.contentFingerprint);
    const failedRecord = buildImportRecord(prepared, 'failed', duplicateSemantic, {
      degradedReason: null,
      failureReason,
      nodeId: duplicateSemantic === 'new' ? null : existingSource?.latest_node_id ?? null
    });
    writeImportSource(driver, failedRecord);
    writeImportEvent(driver, failedRecord);
    return failedRecord;
  });
}

import { randomUUID } from 'node:crypto';

import type {
  ImportDuplicateSemantic,
  PersistedImportRecord,
  PreparedImportRecord
} from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';

const INBOX_NODE_ID = 'special-inbox';

interface ImportSourceRow {
  [column: string]: unknown;
  latest_node_id: string | null;
  last_content_fingerprint: string;
}

interface ExistingNodeRow {
  [column: string]: unknown;
  created_at: string;
  deleted_at: string | null;
  id: string;
  parent_id: string | null;
  position: number | null;
}

interface ExistingInboxRow {
  [column: string]: unknown;
  id: string;
}

function buildImportRecord(
  prepared: PreparedImportRecord,
  resultStatus: PersistedImportRecord['resultStatus'],
  duplicateSemantic: ImportDuplicateSemantic,
  options: Pick<PersistedImportRecord, 'degradedReason' | 'failureReason' | 'nodeId'>
): PersistedImportRecord {
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: options.degradedReason,
    duplicateSemantic,
    failureReason: options.failureReason,
    importId: `import-${randomUUID()}`,
    importedAt: prepared.importedAt,
    nodeId: options.nodeId,
    provider: prepared.provider,
    resultStatus,
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
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
      `SELECT n.id, n.parent_id, n.created_at, n.deleted_at, o.position
       FROM nodes n
       LEFT JOIN node_order o ON o.node_id = n.id
       WHERE n.id = ?`,
      [nodeId]
    ) ?? null
  );
}

function readNextNodePosition(driver: DatabaseDriver) {
  const row = driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return typeof row?.position === 'number' ? row.position + 1 : 0;
}

function ensureInboxNode(driver: DatabaseDriver, importedAt: string) {
  const existingInbox = driver.queryOne<ExistingInboxRow>('SELECT id FROM nodes WHERE id = ?', [INBOX_NODE_ID]);
  if (existingInbox) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, priority, desired_retention, title, is_title_manual,
       content, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, NULL, NULL, 'Inbox', 1, '', NULL, NULL, ?, ?, NULL)`,
    [INBOX_NODE_ID, importedAt, importedAt]
  );
}

function writeImportSource(driver: DatabaseDriver, record: PersistedImportRecord) {
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_fingerprint) DO UPDATE SET
       source_name = excluded.source_name,
       source_locator = excluded.source_locator,
       source_kind = excluded.source_kind,
       last_imported_at = excluded.last_imported_at,
       last_content_fingerprint = excluded.last_content_fingerprint,
       latest_node_id = excluded.latest_node_id`,
    [
      record.sourceFingerprint,
      record.provider,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.importedAt,
      record.importedAt,
      record.contentFingerprint,
      record.nodeId
    ]
  );
}

function writeImportEvent(driver: DatabaseDriver, record: PersistedImportRecord) {
  driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id,
       imported_at, degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.importId,
      record.sourceFingerprint,
      record.provider,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.contentFingerprint,
      record.duplicateSemantic,
      record.resultStatus,
      record.nodeId,
      record.importedAt,
      record.degradedReason,
      record.failureReason
    ]
  );
}

function writeNewNode(driver: DatabaseDriver, record: PersistedImportRecord, content: string) {
  ensureInboxNode(driver, record.importedAt);
  const nodeId = `node-${randomUUID()}`;
  const position = readNextNodePosition(driver);
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, priority, desired_retention, title, is_title_manual,
       content, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, NULL, NULL, ?, 1, ?, NULL, NULL, ?, ?, NULL)`,
    [nodeId, INBOX_NODE_ID, record.sourceName, content, record.importedAt, record.importedAt]
  );
  driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [nodeId, position]);
  return nodeId;
}

function updateExistingNode(driver: DatabaseDriver, existingNode: ExistingNodeRow, record: PersistedImportRecord, content: string) {
  driver.execute(
    `UPDATE nodes
     SET title = ?, is_title_manual = 1, content = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`,
    [record.sourceName, content, record.importedAt, existingNode.id]
  );
  if (typeof existingNode.position !== 'number') {
    driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [existingNode.id, readNextNodePosition(driver)]);
  }
  return existingNode.id;
}

function resolveDuplicateSemantic(existingSource: ImportSourceRow | null, contentFingerprint: string) {
  if (!existingSource) {
    return 'new';
  }
  return existingSource.last_content_fingerprint === contentFingerprint ? 'duplicate' : 'updated';
}

export function runPreparedImport(driver: DatabaseDriver, prepared: PreparedImportRecord): PersistedImportRecord {
  return driver.transaction(() => {
    const existingSource = readExistingSource(driver, prepared.sourceFingerprint);
    const duplicateSemantic = resolveDuplicateSemantic(existingSource, prepared.contentFingerprint);
    const baseRecord = buildImportRecord(prepared, prepared.degradedReason ? 'degraded' : 'imported', duplicateSemantic, {
      degradedReason: prepared.degradedReason,
      failureReason: null,
      nodeId: existingSource?.latest_node_id ?? null
    });

    if (duplicateSemantic === 'duplicate') {
      writeImportSource(driver, baseRecord);
      writeImportEvent(driver, baseRecord);
      return baseRecord;
    }
    if (prepared.content.trim().length === 0) {
      const degradedRecord: PersistedImportRecord = {
        ...baseRecord,
        degradedReason: prepared.degradedReason ?? 'empty_content',
        resultStatus: 'degraded'
      };
      writeImportSource(driver, degradedRecord);
      writeImportEvent(driver, degradedRecord);
      return degradedRecord;
    }

    const anchoredImport = applyImportedHighlightAnchors({
      content: prepared.content,
      highlights: prepared.matchedHighlights
    });
    const existingNode = existingSource?.latest_node_id ? readExistingNode(driver, existingSource.latest_node_id) : null;
    const nodeId =
      duplicateSemantic === 'updated' && existingNode && !existingNode.deleted_at
        ? updateExistingNode(driver, existingNode, baseRecord, anchoredImport.content)
        : writeNewNode(driver, baseRecord, anchoredImport.content);
    if (duplicateSemantic === 'new') {
      insertImportedHighlightNodes({
        driver,
        highlights: anchoredImport.highlights,
        importedAt: baseRecord.importedAt,
        parentNodeId: nodeId,
        startPosition: readNextNodePosition(driver)
      });
    }
    const persistedRecord = { ...baseRecord, nodeId };
    writeImportSource(driver, persistedRecord);
    writeImportEvent(driver, persistedRecord);
    return persistedRecord;
  });
}

export function recordPreparedImportFailure(
  driver: DatabaseDriver,
  prepared: PreparedImportRecord,
  failureReason: string
): PersistedImportRecord {
  return driver.transaction(() => {
    const existingSource = readExistingSource(driver, prepared.sourceFingerprint);
    const duplicateSemantic = resolveDuplicateSemantic(existingSource, prepared.contentFingerprint);
    const failedRecord = buildImportRecord(prepared, 'failed', duplicateSemantic, {
      degradedReason: null,
      failureReason,
      nodeId: existingSource?.latest_node_id ?? null
    });
    writeImportSource(driver, failedRecord);
    writeImportEvent(driver, failedRecord);
    return failedRecord;
  });
}

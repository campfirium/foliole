import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';

import {
  captureReadwiseOriginalEpubSnapshot,
  readReadwiseOriginalEpubRuntimeStatus
} from './readwiseOriginalEpubTarget.js';

interface TargetRow extends DatabaseRow {
  connection_ref: string;
  document_id: string;
  node_id: string;
  source_fingerprint: string;
  state_json: string;
  title: string;
}

export interface ReadwiseSourceResyncTarget {
  connectionRef: string;
  documentId: string;
  nodeId: string;
  sourceFingerprint: string;
  state: ReturnType<typeof normalizeReadwiseApiDocumentImportState>;
  title: string;
}

export function loadReadwiseSourceResyncTarget(nodeId: string): ReadwiseSourceResyncTarget | null {
  const row = openDatabaseConnection().driver.queryOne<TargetRow>(
    `SELECT i.remote_connection_ref connection_ref, i.remote_document_id document_id,
       i.source_fingerprint, i.remote_import_state_json state_json, n.id node_id, n.title
     FROM import_sources i JOIN nodes n ON n.id = i.latest_node_id
     WHERE i.remote_provider = 'readwise' AND n.id = ? AND n.deleted_at IS NULL`,
    [nodeId]
  );
  if (!row?.connection_ref || !row.document_id) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(row.state_json || '{}'); } catch { return null; }
  return {
    connectionRef: row.connection_ref,
    documentId: row.document_id,
    nodeId: row.node_id,
    sourceFingerprint: row.source_fingerprint,
    state: normalizeReadwiseApiDocumentImportState(parsed),
    title: row.title
  };
}

export function readReadwiseSourceResyncRuntimeStatus(target: ReadwiseSourceResyncTarget) {
  return readReadwiseOriginalEpubRuntimeStatus(target);
}

export function captureReadwiseSourceResyncSnapshot(target: ReadwiseSourceResyncTarget) {
  return captureReadwiseOriginalEpubSnapshot(target);
}

import { createHash } from 'node:crypto';

import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';

interface TargetRow {
  body_blob_data: Uint8Array | string | null;
  body_blob_hash: string | null;
  connection_ref: string;
  content: string;
  document_id: string;
  import_content_fingerprint: string | null;
  last_imported_at: string;
  node_id: string;
  node_updated_at: string;
  source_fingerprint: string;
  state_json: string;
  title: string;
}

export interface ReadwiseOriginalEpubTarget {
  connectionRef: string;
  documentId: string;
  nodeId: string;
  sourceFingerprint: string;
  state: ReturnType<typeof normalizeReadwiseApiDocumentImportState>;
  title: string;
}

function readTargetRow(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<TargetRow>(
    `SELECT i.remote_connection_ref connection_ref, i.remote_document_id document_id,
       i.source_fingerprint, i.remote_import_state_json state_json, i.last_imported_at,
       n.id node_id, n.title, n.updated_at node_updated_at, n.import_content_fingerprint,
       n.content, n.body_blob_hash, cbd.data body_blob_data
     FROM import_sources i JOIN nodes n ON n.id = i.latest_node_id
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE i.remote_provider = 'readwise' AND n.id = ? AND n.deleted_at IS NULL`,
    [nodeId]
  ) ?? null;
}

export function loadReadwiseOriginalEpubTarget(nodeId: string): ReadwiseOriginalEpubTarget | null {
  const row = readTargetRow(nodeId);
  if (!row?.connection_ref || !row.document_id) return null;
  let parsedState: unknown = null;
  try { parsedState = JSON.parse(row.state_json || '{}'); } catch { return null; }
  const state = normalizeReadwiseApiDocumentImportState(parsedState);
  if (state.metadata.category !== 'epub') return null;
  return {
    connectionRef: row.connection_ref,
    documentId: row.document_id,
    nodeId: row.node_id,
    sourceFingerprint: row.source_fingerprint,
    state,
    title: row.title
  };
}

export function isReadwiseOriginalEpubRuntimeReady(target: ReadwiseOriginalEpubTarget) {
  return readReadwiseOriginalEpubRuntimeStatus(target) === 'ready';
}

export function readReadwiseOriginalEpubRuntimeStatus(target: ReadwiseOriginalEpubTarget) {
  if (!canCurrentHostRunReadwise('api')) return 'source_inactive' as const;
  if (!isStoredReadwiseApiConnectionReady()) return 'reconnect_required' as const;
  return loadReadwiseRemoteSource()?.connectionRef === target.connectionRef
    ? 'ready' as const
    : 'source_inactive' as const;
}

export function captureReadwiseOriginalEpubSnapshot(target: ReadwiseOriginalEpubTarget) {
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<TargetRow>(
    `SELECT i.remote_connection_ref connection_ref, i.remote_document_id document_id,
       i.source_fingerprint, i.remote_import_state_json state_json, i.last_imported_at,
       n.id node_id, n.title, n.updated_at node_updated_at, n.import_content_fingerprint
     FROM import_sources i JOIN nodes n ON n.id = i.latest_node_id
     WHERE i.source_fingerprint = ? AND n.deleted_at IS NULL`, [target.sourceFingerprint]
  );
  if (!source || source.node_id !== target.nodeId) throw new Error('original_epub_target_changed');
  const rows = driver.queryAll<Record<string, unknown>>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id FROM nodes n JOIN tree ON n.parent_id = tree.id WHERE n.deleted_at IS NULL
     ) SELECT id, parent_id, title, content, body_blob_hash, anchor_link, image_regions,
       created_at, updated_at, deleted_at FROM nodes WHERE id IN (SELECT id FROM tree) ORDER BY id`,
    [target.nodeId]
  );
  return createHash('sha256').update(JSON.stringify({
    connectionRef: loadReadwiseRemoteSource()?.connectionRef ?? null,
    hostReady: canCurrentHostRunReadwise('api'),
    rows,
    source
  })).digest('hex');
}

export function assertReadwiseOriginalEpubSourcePristine(target: ReadwiseOriginalEpubTarget) {
  const row = readTargetRow(target.nodeId);
  if (!row || !row.import_content_fingerprint || currentContentFingerprint(row, target) !== row.import_content_fingerprint) {
    throw new Error('original_epub_user_changes_present');
  }
  const generated = openDatabaseConnection().driver.queryAll<{ updated_at: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id FROM nodes n JOIN tree ON n.parent_id = tree.id WHERE n.deleted_at IS NULL
     ) SELECT updated_at FROM nodes WHERE id IN (SELECT id FROM tree) AND id LIKE 'node-epub-%'`,
    [target.nodeId]
  );
  if (generated.some((node) => node.updated_at !== row.last_imported_at)) {
    throw new Error('original_epub_user_changes_present');
  }
}

function currentContentFingerprint(row: TargetRow, target: ReadwiseOriginalEpubTarget) {
  const content = requireResolvedNodeBody(row as TargetRow & NodeBodyRow, row.node_id).content;
  return createPreparedDesktopTextImport({
    content,
    fileName: `${row.title}.html`,
    filePath: `readwise://document/${encodeURIComponent(target.documentId)}`,
    highlightPolicy: 'reference_only',
    importedAt: row.last_imported_at,
    kind: 'html',
    sourceIdentity: `readwise/api/${target.connectionRef}/${target.documentId}`,
    sourceProfile: 'body_with_highlight_sidecar'
  }).contentFingerprint;
}

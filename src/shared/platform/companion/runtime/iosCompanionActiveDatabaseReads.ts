import { buildCompanionPayloadQueryDefinitions } from '../../../../../lib/core/database/androidCompanionPayloadQueryDefinitions';
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionQueryDefinitions';
import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncObjectRecord
} from '../../../../../lib/platform/nativeSyncContract';

import { iosSearchParams, queryIosCompanionDatabase, readIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionDeviceId, iosCompanionHostName } from './iosCompanionMutationState';

function payloads() {
  return buildCompanionPayloadQueryDefinitions(getIosCompanionDatabaseOwner().platform);
}
interface ExternalDocument extends DbRow {
  content: string;
  document_id: string;
  extension: string;
  file_name: string;
  folder_id: string;
  relative_path: string;
  title: string;
  updated_at: string;
}

interface ExternalSearchResult extends ExternalDocument {
  excerpt: string;
  match_start: number;
}

interface ExternalDirectoryEntry extends DbRow {
  absolute_path: string;
  document_id: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  modified_at: string;
  opening_text: string | null;
  relative_path: string;
  title: string;
}

interface ExternalDirectoryFolder extends DbRow {
  document_count: number;
  folder_path: string;
  id: string;
}

interface PdfPage extends DbRow {
  page: number;
  page_height: number | null;
  page_width: number | null;
  text: string;
}

interface PdfSearchResult extends PdfPage {
  attachment_id: string;
  excerpt: string;
  match_start: number;
}

interface TopicSearchResult extends DbRow {
  excerpt: string;
  match_start: number;
  node_id: string;
  opening_text: string | null;
  title: string;
  updated_at: string;
}

export interface CompanionNodeDocumentRow extends DbRow {
  body_blob_hash: string | null;
  content: string;
  content_status: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  id: string;
  pdf_attachment_id: string | null;
  reveal: string | null;
  title: string;
}

export function loadIosSyncIndex() {
  return queryIosCompanionDatabase<NativeSyncIndexEntry & DbRow>('syncIndex');
}

export function loadIosSyncNodeConflicts() {
  return queryIosCompanionDatabase<NativeSyncNodeConflictRecord & DbRow>('nodeConflicts');
}

export function loadIosCompanionHostName() {
  return readIosCompanionDatabase((db) => iosCompanionHostName(db));
}

export async function loadIosSyncObjects(objectIds: string[], objectTypes?: string[]) {
  if (objectIds.length === 0) return [];
  const ids = objectIds.map(() => '?').join(', ');
  const types = objectTypes?.length ? objectTypes.map(() => '?').join(', ') : 'NULL';
  const definition = ANDROID_COMPANION_QUERY_DEFINITIONS.syncObjects;
  const sql = definition.sql.replace(':objectIds', ids).replace(':objectTypes', types);
  const params = [...objectIds, objectTypes?.length ? 1 : 0, ...(objectTypes ?? [])];
  const rows = await readIosCompanionDatabase<NativeSyncObjectRecord[]>((db) => db.query<NativeSyncObjectRecord & DbRow>(sql, params));
  return Promise.all(rows.map(async (row) => ({
    ...row,
    payload_json: row.deleted_at ? null : await loadPayload(row)
  })));
}

export function searchIosTopics(query: string, limit = 20) {
  return search<TopicSearchResult & DbRow>('topicSearch', query, limit);
}

export function loadIosCompanionNodeDocument(nodeId: string) {
  return queryIosCompanionDatabase<CompanionNodeDocumentRow>('readableArticleByNodeId', [nodeId])
    .then((rows) => rows[0] ?? null);
}

export function loadIosCompanionAnnotationContents(parentNodeId: string) {
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<{ content: string; id: string }>(
      `SELECT n.id, COALESCE(CAST(cbd.data AS TEXT), n.content, '') AS content
       FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.parent_id = ? AND n.anchor_link IS NOT NULL AND n.deleted_at IS NULL`,
      [parentNodeId]
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.content]));
  });
}

export function loadIosPdfPageText(attachmentId: string) {
  return queryIosCompanionDatabase<PdfPage & DbRow>('pdfPageTextPages', [attachmentId]);
}

export function searchIosPdfPageText(query: string, limit = 20) {
  return search<PdfSearchResult & DbRow>('pdfPageTextSearch', query, limit);
}

export function loadIosExternalDocument(documentId: string) {
  return queryIosCompanionDatabase<ExternalDocument & DbRow>('externalDocumentById', [documentId]).then((rows) => rows[0] ?? null);
}

export async function loadIosExternalDirectory() {
  const [entries, folders] = await Promise.all([
    queryIosCompanionDatabase<ExternalDirectoryEntry>('externalDocumentDirectoryEntries'),
    queryIosCompanionDatabase<ExternalDirectoryFolder>('externalSearchFolders')
  ]);
  return { entries, folders };
}

export function searchIosExternalDocuments(query: string, limit = 20) {
  return search<ExternalSearchResult & DbRow>('externalDocumentSearch', query, limit);
}

export async function loadIosMissingContentBlobs(limit = 50) {
  const [rows, summary] = await Promise.all([
    queryIosCompanionDatabase<{ hash: string; size_bytes: number } & DbRow>('contentBlobMissingHashes', [
      Math.max(1, Math.min(500, limit))
    ]),
    queryIosCompanionDatabase<DbRow>('contentBlobMissingSummaryRows')
  ]);
  const blobs = rows.slice(0, Math.max(1, limit));
  const failed = summary.filter((row) => row.availability === 'failed');
  return {
    blobs,
    failed_content_blob_bytes: sumBytes(failed),
    failed_content_blob_count: failed.length,
    hashes: blobs.map((row) => row.hash),
    missing_content_blob_bytes: sumBytes(summary),
    missing_content_blob_count: summary.length
  };
}

export async function loadIosMissingAttachments(limit = 50, attachmentId?: string) {
  if (!attachmentId) return [];
  const rows = await queryIosCompanionDatabase<DbRow>('attachmentResourceMissingById', [attachmentId]);
  return rows.slice(0, Math.max(1, limit));
}

function search<T extends DbRow>(name: 'topicSearch' | 'pdfPageTextSearch' | 'externalDocumentSearch', query: string, limit: number) {
  const definition = ANDROID_COMPANION_QUERY_DEFINITIONS[name];
  return queryIosCompanionDatabase<T>(name, iosSearchParams(definition.sql, query, Math.max(1, Math.min(100, limit))));
}

async function loadPayload(row: NativeSyncObjectRecord) {
  const definition = payloadDefinition(row);
  if (!definition) throw new Error(`unsupported_ios_sync_object:${row.object_type}`);
  const params = await payloadParams(row, definition.syncPayload.argMode);
  const payload = (await readIosCompanionDatabase<DbRow[]>((db) => db.query(definition.sql, params)))[0];
  if (typeof payload?.payload_json === 'string') return payload.payload_json;
  return JSON.stringify(payload ?? {});
}

function payloadDefinition(row: NativeSyncObjectRecord) {
  if (row.object_type !== 'view_state') {
    return Object.values(payloads()).find((candidate) => candidate.syncPayload?.objectType === row.object_type);
  }
  const definitions = payloads();
  return row.object_id.endsWith(':active_node') ? definitions.syncPayloadViewActiveNode : definitions.syncPayloadViewNodeState;
}

async function payloadParams(row: NativeSyncObjectRecord, mode: string) {
  if (mode === 'none') return [];
  if (mode !== 'view_state_node') return [row.object_id];
  const marker = ':node:';
  const offset = row.object_id.indexOf(marker);
  if (offset < 0) throw new Error(`invalid_ios_view_state_object:${row.object_id}`);
  const deviceId = await readIosCompanionDatabase((db) => iosCompanionDeviceId(db));
  return [row.object_id.slice(offset + marker.length), deviceId];
}

function sumBytes(rows: DbRow[]) {
  return rows.reduce((total, row) => total + Number(row.size_bytes ?? 0), 0);
}

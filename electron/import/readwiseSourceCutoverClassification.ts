import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import type { ReadwiseSourceCutoverClassificationStatus } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openDatabaseConnection } from '../database/connection.js';
import type { ConfirmedReadwiseIdentityBinding } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import type { ReadwiseSourceCutoverIdentityBinding } from './readwiseSourceCutoverIdentity.js';

export function recordReadwiseSourceCutoverClassification(
  document: PreparedReadwiseApiDocument,
  status: ReadwiseSourceCutoverClassificationStatus,
  binding: ReadwiseSourceCutoverIdentityBinding | null
) {
  const current = requireCutoverV2();
  if (current.documents.some((item) => item.remoteId === document.id)) return;
  const byRemote = new Map(binding?.annotations.map((item) => [item.remoteId, item.nodeId]) ?? []);
  const blocked = binding?.blockedAnnotationIds ?? new Set<string>();
  writeReadwiseSourceCutover({
    ...current,
    annotations: [...current.annotations, ...document.annotations.map((item) => ({
      nodeId: byRemote.get(item.remoteId) ?? null,
      remoteId: item.remoteId,
      status: annotationStatus(status, byRemote.has(item.remoteId), blocked.has(item.remoteId))
    }))],
    documents: [...current.documents, {
      nodeId: binding?.nodeId ?? null,
      remoteId: document.id,
      status
    }]
  });
}

function requireCutoverV2() {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2) throw new Error('readwise_source_cutover_v2_required');
  return state;
}

function annotationStatus(
  documentStatus: ReadwiseSourceCutoverClassificationStatus,
  hasBinding: boolean,
  blocked: boolean
) {
  if (blocked || documentStatus === 'blocked') return 'blocked' as const;
  if (hasBinding) return documentStatus === 'materialized' ? 'materialized' as const : 'bound' as const;
  if (documentStatus === 'external') return 'external' as const;
  if (documentStatus === 'unavailable') return 'unavailable' as const;
  throw new Error('readwise_source_cutover_annotation_binding_missing');
}

export function loadReadwiseSourceCutoverBinding(
  connectionRef: string,
  documentId: string
): ReadwiseSourceCutoverIdentityBinding | null {
  const row = openDatabaseConnection().driver.queryOne<{
    latest_node_id: string;
    remote_annotations_json: string;
    remote_document_id: string;
    source_fingerprint: string;
    remote_import_state_json: string;
  }>(
    "SELECT source_fingerprint, latest_node_id, remote_document_id, remote_annotations_json, remote_import_state_json " +
      "FROM import_sources WHERE remote_provider = 'readwise' AND remote_connection_ref = ? " +
      'AND remote_document_id = ?',
    [connectionRef, documentId]
  );
  if (!row?.latest_node_id) return null;
  try {
    const state = normalizeReadwiseApiDocumentImportState(JSON.parse(row.remote_import_state_json));
    return {
      annotations: JSON.parse(row.remote_annotations_json) as ConfirmedReadwiseIdentityBinding['annotations'],
      blockedAnnotationIds: new Set(state.annotations.filter((item) => item.blockedAt).map((item) => item.remoteId)),
      nodeId: row.latest_node_id,
      remoteDocumentId: row.remote_document_id,
      sourceFingerprint: row.source_fingerprint
    };
  } catch {
    return null;
  }
}

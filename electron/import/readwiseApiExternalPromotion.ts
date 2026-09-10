import { createHash } from 'node:crypto';

import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import type { NativeTextImportResult } from '../../lib/platform/nativeImportContract.js';
import { loadReadwiseApiExternalReference } from '../database/readwiseApiExternalDocuments.js';
import {
  loadReadwiseApiImportSource,
  loadStagedReadwiseApiContracts
} from '../database/readwiseApiImportState.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';

export async function promoteReadwiseApiExternalDocument(documentId: string): Promise<NativeTextImportResult | null> {
  const reference = loadReadwiseApiExternalReference(documentId);
  if (!reference) return null;
  const staged = loadStagedReadwiseApiContracts(reference.connection_ref);
  const document = prepareReadwiseApiDocuments(
    staged.readerDocuments,
    staged.exportBooks
  ).find((candidate) => candidate.id === reference.remote_document_id);
  if (!document) throw new Error('Refresh the Readwise preview before importing this source.');
  const importedAt = new Date().toISOString();
  const before = loadReadwiseApiImportSource(reference.connection_ref, document.id);
  const config = loadImportManagerSettings().readwiseReaderConfig;
  const result = await commitReadwiseApiDocument({
    config,
    connectionRef: reference.connection_ref,
    destination: 'inbox',
    document
  });
  const source = loadReadwiseApiImportSource(reference.connection_ref, document.id);
  if (result.status !== 'imported' || !source?.nodeId) return null;
  return {
    content_fingerprint: sha256(document.body),
    degraded_reason: null,
    duplicate_semantic: before ? 'updated' : 'new',
    failure_reason: null,
    import_id: `readwise-api:${reference.connection_ref}:${document.id}`,
    imported_at: importedAt,
    node_id: source.nodeId,
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: source.sourceFingerprint,
    source_kind: 'html',
    source_locator: `readwise://document/${encodeURIComponent(document.id)}`,
    source_name: `${document.title}.html`
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

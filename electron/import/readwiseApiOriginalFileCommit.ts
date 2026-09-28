import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiOriginalFileState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { deleteNodeAttachmentLink } from '../database/attachments.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import {
  attachReadwiseApiOriginalFile,
  persistReadwiseApiOriginalFile,
  type PreparedReadwiseOriginalFile
} from './readwiseApiOriginalFile.js';

export async function persistPreparedOriginalFile(input: {
  category: 'epub' | 'pdf';
  document: PreparedReadwiseApiDocument;
  nodeId: string | null;
  prepared: PreparedReadwiseOriginalFile;
  previous: ReadwiseApiOriginalFileState | null | undefined;
}) {
  let finalState = input.prepared.state;
  if (input.prepared.bytes && input.prepared.state.status === 'localized' && input.nodeId) {
    try {
      await persistReadwiseApiOriginalFile({
        bytes: input.prepared.bytes, category: input.category, nodeId: input.nodeId,
        state: input.prepared.state, title: input.document.title
      });
    } catch {
      finalState = unavailableState(Boolean(input.document.body.trim()), 'original_file_storage_failed');
    }
  } else if (input.prepared.state.status === 'localized' && input.nodeId) {
    const nodeId = input.nodeId;
    const state = input.prepared.state;
    await runWithDatabaseConnectionOwner(() => attachReadwiseApiOriginalFile(nodeId, state));
  }
  await runWithDatabaseConnectionOwner(() => (
    replacePreviousOriginalLink(input.nodeId, input.previous, finalState)
  ));
  return finalState;
}

export function saveOriginalFileState(
  connectionRef: string, documentId: string, originalFile: ReadwiseApiOriginalFileState
) {
  const source = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!source) throw new Error('readwise_api_import_source_missing');
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations), connectionRef, documentId,
    sourceFingerprint: source.sourceFingerprint, state: { ...source.state, originalFile },
    updatedAt: new Date().toISOString()
  });
}

function replacePreviousOriginalLink(
  nodeId: string | null,
  previous: ReadwiseApiOriginalFileState | null | undefined,
  current: ReadwiseApiOriginalFileState
) {
  if (!nodeId || previous?.status !== 'localized' || current.status !== 'localized'
    || previous.attachmentId === current.attachmentId) return;
  deleteNodeAttachmentLink({ attachmentId: previous.attachmentId, nodeId, role: 'reference' });
}

function unavailableState(hasHtmlBody: boolean, reason: string): ReadwiseApiOriginalFileState {
  return {
    attachmentId: null, contentHash: null, mimeType: null, reason, sizeBytes: null,
    status: hasHtmlBody ? 'html_only' : 'unavailable'
  };
}

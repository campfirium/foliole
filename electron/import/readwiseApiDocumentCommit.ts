import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, stableReadwiseEpubNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiOriginalFileState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { filterPostCutoverReadwiseDocument } from '../../lib/core/readwise/readwiseSourceCutover.js';
import {
  loadReadwiseApiImportSource,
  saveReadwiseApiImportSource
} from '../database/readwiseApiImportState.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { buildReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';
import { prepareReadwiseApiEpubImagesIfNeeded } from './readwiseApiEpubImagePreparation.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import {
  persistReadwiseApiOriginalFile,
  prepareReadwiseApiOriginalFile
} from './readwiseApiOriginalFile.js';

interface ReadwiseApiDocumentCommitInput {
  assertEligible?: () => void;
  config: ReadwiseReaderConfig;
  connectionRef: string;
  dependencies?: ReadwiseApiFetchDependencies;
  destination: Exclude<ReadwiseImportDestination, 'off'>;
  document: PreparedReadwiseApiDocument;
  replaceExistingBody?: boolean;
  reimportDeleted?: boolean;
}

export async function commitReadwiseApiDocument(input: ReadwiseApiDocumentCommitInput) {
  const { existingBefore, guardedDocument } = guardPostCutoverDocument(input.connectionRef, input.document);
  if (!guardedDocument) {
    return { annotationCount: 0, documentId: input.document.id, status: 'skipped' as const };
  }
  input = { ...input, document: guardedDocument };
  const isOriginalFile = input.document.category === 'pdf';
  const previousOriginalFile = input.reimportDeleted && existingBefore?.nodeDeleted
    ? null : existingBefore?.state.originalFile;
  const destination = existingBefore ? 'inbox' : input.destination;
  const prepared = isOriginalFile && destination === 'inbox' && previousOriginalFile?.status !== 'localized'
    ? await prepareReadwiseApiOriginalFile({
      category: 'pdf',
      ...(input.dependencies ? { dependencies: input.dependencies } : {}),
      documentId: input.document.id, hasHtmlBody: Boolean(input.document.body.trim())
    }) : null;
  const document = isOriginalFile && destination === 'inbox'
    ? withOriginalFileStatus(input.document, prepared?.state ?? previousOriginalFile ?? null)
    : input.document;
  const preparedEpubImages = await prepareReadwiseApiEpubImagesIfNeeded({
    config: input.config,
    connectionRef: input.connectionRef,
    destination,
    document,
    forceEpubStructure: Boolean(input.reimportDeleted && existingBefore?.nodeDeleted)
  });
  input.assertEligible?.();
  const result = materializeReadwiseApiDocument({
    config: input.config, connectionRef: input.connectionRef, destination, document, preparedEpubImages,
    ...(input.reimportDeleted === undefined ? {} : { reimportDeleted: input.reimportDeleted }),
    ...(input.replaceExistingBody === undefined ? {} : { replaceExistingBody: input.replaceExistingBody })
  });
  if (!isOriginalFile || result.status !== 'imported') return result;

  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  if (!prepared || previousOriginalFile?.status === 'localized') return result;
  input.assertEligible?.();
  let finalState = prepared.state;
  if (prepared.bytes && prepared.state.status === 'localized' && existing?.nodeId) {
    try {
      await persistReadwiseApiOriginalFile({
        bytes: prepared.bytes,
        category: 'pdf',
        nodeId: existing.nodeId,
        state: prepared.state,
        title: input.document.title
      });
    } catch {
      finalState = unavailableState(Boolean(input.document.body.trim()), 'original_file_storage_failed');
    }
  }
  saveOriginalFileState(input.connectionRef, input.document.id, finalState);
  return result;
}

function guardPostCutoverDocument(connectionRef: string, document: PreparedReadwiseApiDocument) {
  const existingBefore = loadReadwiseApiImportSource(connectionRef, document.id);
  const binding = existingBefore ? {
    annotationRemoteIds: new Set(existingBefore.annotations.map((item) => item.remoteId))
  } : null;
  const cutover = loadReadwiseSourceCutover();
  let guardedDocument = filterPostCutoverReadwiseDocument(cutover, document, binding);
  if (cutover?.version === 2 && guardedDocument) {
    const retired = new Set(cutover.retiredNodeIds);
    const structureNodes = buildReadwiseApiEpubBookNodes(document.epubStructure?.sections ?? []);
    if ((existingBefore?.nodeId && retired.has(existingBefore.nodeId)) || structureNodes.some((node) =>
      retired.has(stableReadwiseEpubNodeId(connectionRef, document.id, node.key)))) guardedDocument = null;
    else guardedDocument = { ...guardedDocument, annotations: guardedDocument.annotations.filter((annotation) =>
      !retired.has(stableReadwiseAnnotationNodeId(connectionRef, annotation.remoteId))) };
  }
  return { existingBefore, guardedDocument };
}

function saveOriginalFileState(connectionRef: string, documentId: string, originalFile: ReadwiseApiOriginalFileState) {
  const source = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!source) throw new Error('readwise_api_import_source_missing');
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations), connectionRef, documentId,
    sourceFingerprint: source.sourceFingerprint, state: { ...source.state, originalFile },
    updatedAt: new Date().toISOString()
  });
}

function withOriginalFileStatus(
  document: PreparedReadwiseApiDocument,
  state: ReadwiseApiOriginalFileState | null
): PreparedReadwiseApiDocument {
  if (!state) return document;
  const links = [
    document.metadata.readerUrl ? `[Open in Reader](${document.metadata.readerUrl})` : null,
    document.metadata.sourceUrl ? `[Open source](${document.metadata.sourceUrl})` : null
  ].filter(Boolean).join(' · ');
  const baseBody = document.body.trim() || `# ${document.title}`;
  const kind = document.category.toUpperCase();
  const notice = state.status === 'localized'
    ? `The original ${kind} is saved with this Topic.`
    : `The original ${kind} was not synced: ${formatReason(state.reason)}.`;
  return {
    ...document,
    body: [baseBody, `> ${notice}`, links].filter(Boolean).join('\n\n'),
    degradedReason: state.status === 'unavailable' ? notice : document.degradedReason
  };
}

function formatReason(reason: string | null) {
  const reasons: Record<string, string> = {
    original_file_download_failed: 'the download failed',
    original_file_mime_mismatch: 'the server returned a different file type',
    original_file_not_distributed: 'Reader did not provide a downloadable file',
    original_file_signature_mismatch: 'the downloaded file did not pass validation',
    original_file_storage_failed: 'the validated file could not be stored',
    original_file_too_large: 'the file exceeds the 100 MB limit',
    original_file_url_rejected: 'the download address did not pass validation'
  };
  return reason && reasons[reason] ? reasons[reason] : 'the file is currently unavailable';
}

function unavailableState(hasHtmlBody: boolean, reason: string): ReadwiseApiOriginalFileState {
  return {
    attachmentId: null, contentHash: null, mimeType: null, reason, sizeBytes: null,
    status: hasHtmlBody ? 'html_only' : 'unavailable'
  };
}

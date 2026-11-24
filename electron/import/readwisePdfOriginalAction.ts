import type { NativeReadwisePdfOriginalActionState, NativeReadwisePdfOriginalResult } from '../../lib/platform/nativeReadwiseContract.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadNodeResourceReferences } from '../database/nodeResources.js';
import { markPdfAttachmentIndexPending, enqueuePdfAttachmentIndexing } from '../database/pdfIndexing.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { fetchReadwiseRawSourceDocument } from './readwiseApiImportFetch.js';
import { attachReadwiseApiOriginalFile, prepareReadwiseApiOriginalFile, stageReadwiseApiOriginalFile } from './readwiseApiOriginalFile.js';
import { replacePreviousOriginalLink, saveOriginalFileState } from './readwiseApiOriginalFileCommit.js';
import { placeReadwisePdfHighlights, placeReadwisePdfHighlightsFromAttachment, readReadwisePdfPages } from './readwisePdfPlacement.js';
import { beginReadwiseSourceOperation, finishReadwiseSourceOperation, isReadwiseSourceOperationRunning } from './readwiseSourceOperationLock.js';
import { captureReadwiseSourceResyncSnapshot, loadReadwiseSourceResyncTarget, readReadwiseSourceResyncRuntimeStatus } from './readwiseSourceResyncTarget.js';

type ReadwisePdfTarget = NonNullable<ReturnType<typeof loadReadwiseSourceResyncTarget>>;

function targetFor(nodeId: string) {
  const target = loadReadwiseSourceResyncTarget(nodeId);
  return target?.state.metadata.category === 'pdf' && target.state.originalFile?.status !== 'localized' ? target : null;
}

export function loadReadwisePdfOriginalActionState(nodeId: string): NativeReadwisePdfOriginalActionState {
  const target = targetFor(nodeId);
  if (!target) return { node_id: nodeId, status: 'not_applicable' };
  if (isReadwiseSourceOperationRunning(nodeId)) return { node_id: nodeId, status: 'running' };
  return { node_id: nodeId, status: readReadwiseSourceResyncRuntimeStatus(target) };
}

export async function getReadwisePdfOriginal(
  nodeId: string,
  dependencies?: ReadwiseApiFetchDependencies
): Promise<NativeReadwisePdfOriginalResult> {
  const start = await runWithDatabaseConnectionOwner(() => {
    const target = targetFor(nodeId);
    if (!target) return null;
    if (readReadwiseSourceResyncRuntimeStatus(target) !== 'ready' || !beginReadwiseSourceOperation(nodeId)) {
      return { blocked: true as const };
    }
    return { blocked: false as const, target, snapshot: captureReadwiseSourceResyncSnapshot(target) };
  });
  if (!start) return { node_id: nodeId, status: 'not_applicable' };
  if (start.blocked) return { node_id: nodeId, status: 'source_inactive' };
  try {
    await localizeReadwisePdfOriginal(start.target, start.snapshot, dependencies);
    return { node_id: nodeId, status: 'completed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const errorCode = /^[a-z0-9_]+$/u.test(message) ? message : 'readwise_pdf_original_failed';
    console.error('[readwise-pdf-original] failed', { errorCode, nodeId });
    return { error_code: errorCode, node_id: nodeId, status: 'failed' };
  } finally {
    finishReadwiseSourceOperation(nodeId);
  }
}

export async function resyncReadwisePdfOriginal(
  target: ReadwisePdfTarget,
  snapshot: string,
  dependencies?: ReadwiseApiFetchDependencies
) {
  const original = target.state.originalFile;
  if (original?.status === 'localized') {
    const found = await placeReadwisePdfHighlightsFromAttachment({
      attachmentId: original.attachmentId, connectionRef: target.connectionRef,
      documentId: target.documentId, nodeId: target.nodeId
    }, () => {
      assertUnchangedPdfTarget(target, snapshot);
      const isAttached = loadNodeResourceReferences(target.nodeId).some(reference =>
        reference.role === 'reference' && reference.storage_key === `${original.attachmentId}.pdf`);
      if (!isAttached) attachReadwiseApiOriginalFile(target.nodeId, original, target.title);
    });
    if (found) return;
  }
  await localizeReadwisePdfOriginal(target, snapshot, dependencies);
}

function assertUnchangedPdfTarget(target: ReadwisePdfTarget, snapshot: string) {
  const current = loadReadwiseSourceResyncTarget(target.nodeId);
  if (current?.state.metadata.category !== 'pdf' || current.connectionRef !== target.connectionRef
    || current.documentId !== target.documentId || current.sourceFingerprint !== target.sourceFingerprint
    || readReadwiseSourceResyncRuntimeStatus(current) !== 'ready'
    || captureReadwiseSourceResyncSnapshot(current) !== snapshot) {
    throw new Error('readwise_pdf_target_changed');
  }
}

async function localizeReadwisePdfOriginal(
  target: ReadwisePdfTarget,
  snapshot: string,
  dependencies?: ReadwiseApiFetchDependencies
) {
  const nodeId = target.nodeId;
  const remote = await fetchReadwiseRawSourceDocument(target.documentId, dependencies);
  if (remote?.category !== 'pdf' || !remote.rawSourceUrl) throw new Error('original_file_not_distributed');
  const prepared = await prepareReadwiseApiOriginalFile({
    category: 'pdf', documentId: target.documentId, hasHtmlBody: true,
    ...(dependencies ? { dependencies } : {}), rawSourceUrl: remote.rawSourceUrl
  });
  if (!prepared.bytes || prepared.state.status !== 'localized') {
    throw new Error(prepared.state.reason ?? 'original_file_download_failed');
  }
  const localized = prepared.state;
  const pages = await readReadwisePdfPages(prepared.bytes);
  await runWithDatabaseConnectionOwner(() => assertUnchangedPdfTarget(target, snapshot));
  await stageReadwiseApiOriginalFile({ bytes: prepared.bytes, state: localized, title: target.title });
  if (target.state.originalFile?.status === 'localized'
    && (await resolveAttachmentFile(`${localized.attachmentId}.pdf`)).status !== 'ready') {
    throw new Error('original_file_storage_failed');
  }
  await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.transaction(() => {
    assertUnchangedPdfTarget(target, snapshot);
    const source = loadReadwiseApiImportSource(target.connectionRef, target.documentId);
    if (!source || source.nodeId !== nodeId) throw new Error('readwise_pdf_target_changed');
    attachReadwiseApiOriginalFile(nodeId, localized, target.title);
    replacePreviousOriginalLink(nodeId, target.state.originalFile, localized);
    saveOriginalFileState(target.connectionRef, target.documentId, localized);
    const replaced = target.state.originalFile?.status === 'localized'
      && target.state.originalFile.attachmentId !== localized.attachmentId;
    placeReadwisePdfHighlights({ connectionRef: target.connectionRef,
      documentId: target.documentId, nodeId, pages, relocateExisting: replaced });
    markPdfAttachmentIndexPending(localized.attachmentId);
    enqueuePdfAttachmentIndexing(localized.attachmentId);
  }));
}

import type { NativeReadwisePdfOriginalActionState, NativeReadwisePdfOriginalResult } from '../../lib/platform/nativeReadwiseContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { markPdfAttachmentIndexPending, enqueuePdfAttachmentIndexing } from '../database/pdfIndexing.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { fetchReadwiseRawSourceDocument } from './readwiseApiImportFetch.js';
import { attachReadwiseApiOriginalFile, prepareReadwiseApiOriginalFile, stageReadwiseApiOriginalFile } from './readwiseApiOriginalFile.js';
import { saveOriginalFileState } from './readwiseApiOriginalFileCommit.js';
import { readReadwisePdfPages, placeReadwisePdfHighlights } from './readwisePdfPlacement.js';
import { beginReadwiseSourceOperation, finishReadwiseSourceOperation, isReadwiseSourceOperationRunning } from './readwiseSourceOperationLock.js';
import { captureReadwiseSourceResyncSnapshot, loadReadwiseSourceResyncTarget, readReadwiseSourceResyncRuntimeStatus } from './readwiseSourceResyncTarget.js';

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
    const remote = await fetchReadwiseRawSourceDocument(start.target.documentId, dependencies);
    if (remote?.category !== 'pdf' || !remote.rawSourceUrl) throw new Error('original_file_not_distributed');
    const prepared = await prepareReadwiseApiOriginalFile({
      category: 'pdf', documentId: start.target.documentId, hasHtmlBody: true,
      ...(dependencies ? { dependencies } : {}), rawSourceUrl: remote.rawSourceUrl
    });
    if (!prepared.bytes || prepared.state.status !== 'localized') {
      throw new Error(prepared.state.reason ?? 'original_file_download_failed');
    }
    const localized = prepared.state;
    const pages = await readReadwisePdfPages(prepared.bytes);
    await stageReadwiseApiOriginalFile({ bytes: prepared.bytes, state: localized, title: start.target.title });
    await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.transaction(() => {
      if (readReadwiseSourceResyncRuntimeStatus(start.target) !== 'ready' ||
        captureReadwiseSourceResyncSnapshot(start.target) !== start.snapshot || !targetFor(nodeId)) {
        throw new Error('readwise_pdf_target_changed');
      }
      const source = loadReadwiseApiImportSource(start.target.connectionRef, start.target.documentId);
      if (!source || source.nodeId !== nodeId) throw new Error('readwise_pdf_target_changed');
      attachReadwiseApiOriginalFile(nodeId, localized, start.target.title);
      saveOriginalFileState(start.target.connectionRef, start.target.documentId, localized);
      placeReadwisePdfHighlights({ connectionRef: start.target.connectionRef, documentId: start.target.documentId, nodeId, pages });
      markPdfAttachmentIndexPending(localized.attachmentId);
      enqueuePdfAttachmentIndexing(localized.attachmentId);
    }));
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

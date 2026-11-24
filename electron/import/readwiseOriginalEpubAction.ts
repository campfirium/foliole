import { randomUUID } from 'node:crypto';

import type { BrowserWindow } from 'electron';

import type {
  NativeReadwiseBookEpubProgressEvent,
  NativeReadwiseOriginalEpubActionState,
  NativeReadwiseOriginalEpubResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { cleanCreatedManagedAttachmentFiles } from '../attachments/managedAttachmentFileStage.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { downloadReadwiseOriginalEpubFile } from './readwiseApiOriginalFile.js';
import { buildLocalReadwiseOriginalEpubDocument } from './readwiseOriginalEpubAnnotations.js';
import { commitReadwiseOriginalEpub } from './readwiseOriginalEpubCommit.js';
import { readReadwiseOriginalEpubDisconnectSignal } from './readwiseOriginalEpubDisconnect.js';
import { prepareOriginalEpubCandidate, type PreparedOriginalEpubCandidate } from './readwiseOriginalEpubPreparation.js';
import { fetchOriginalEpubRemoteRoot } from './readwiseOriginalEpubRemote.js';
import {
  captureReadwiseOriginalEpubSnapshot,
  isReadwiseOriginalEpubRuntimeReady,
  loadReadwiseOriginalEpubTarget,
  readReadwiseOriginalEpubRuntimeStatus
} from './readwiseOriginalEpubTarget.js';
import {
  beginReadwiseSourceOperation,
  finishReadwiseSourceOperation,
  isReadwiseSourceOperationRunning
} from './readwiseSourceOperationLock.js';

function publish(
  window: BrowserWindow | null,
  nodeId: string,
  operationId: string,
  phase: NativeReadwiseBookEpubProgressEvent['phase'],
  detail: string,
  progress: number
) {
  if (window?.isDestroyed()) return;
  window?.webContents.send(IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL, {
    detail, nodeId, operationId, phase, progress
  });
}

export function loadReadwiseOriginalEpubActionState(nodeId: string) {
  return runWithDatabaseConnectionOwner((): NativeReadwiseOriginalEpubActionState => {
    const target = loadReadwiseOriginalEpubTarget(nodeId);
    if (!target) return { node_id: nodeId, status: 'not_applicable' };
    if (isReadwiseSourceOperationRunning(nodeId)) return { node_id: nodeId, status: 'running' };
    return { node_id: nodeId, status: readReadwiseOriginalEpubRuntimeStatus(target) };
  });
}

function beginRebuild(nodeId: string) {
  const target = loadReadwiseOriginalEpubTarget(nodeId);
  if (!target) return { status: 'not_applicable' } as const;
  if (!isReadwiseOriginalEpubRuntimeReady(target) || !beginReadwiseSourceOperation(nodeId)) {
    return { status: 'source_inactive' } as const;
  }
  try {
    const expectedSnapshot = captureReadwiseOriginalEpubSnapshot(target);
    return { status: 'ready', target, expectedSnapshot, disconnected: readReadwiseOriginalEpubDisconnectSignal() } as const;
  } catch (error) {
    finishReadwiseSourceOperation(nodeId);
    throw error;
  }
}

export async function useReadwiseOriginalEpub(
  nodeId: string,
  window: BrowserWindow | null = null,
  dependencies?: ReadwiseApiFetchDependencies
): Promise<NativeReadwiseOriginalEpubResult> {
  const operationId = randomUUID();
  let disconnected: AbortSignal | undefined;
  let candidate: PreparedOriginalEpubCandidate | null = null;
  try {
    const start = await runWithDatabaseConnectionOwner(() => beginRebuild(nodeId));
    if (start.status !== 'ready') return { node_id: nodeId, status: start.status };
    const { target, expectedSnapshot } = start;
    disconnected = start.disconnected;
    const signal = dependencies?.signal ? AbortSignal.any([disconnected, dependencies.signal]) : disconnected;
    const fetchDependencies = { ...dependencies, signal };
    signal.throwIfAborted();
    publish(window, nodeId, operationId, 'getting_original', 'Getting original EPUB…', 0);
    const remote = await fetchOriginalEpubRemoteRoot({
      dependencies: fetchDependencies,
      documentId: target.documentId
    });
    signal.throwIfAborted();
    publish(window, nodeId, operationId, 'downloading_epub', 'Downloading EPUB…', 0.2);
    const file = await downloadReadwiseOriginalEpubFile(remote.rawSourceUrl, fetchDependencies);
    const importedAt = new Date().toISOString();
    try {
      signal.throwIfAborted();
      publish(window, nodeId, operationId, 'reading_epub', 'Reading EPUB…', 0.35);
      candidate = await prepareOriginalEpubCandidate({
        filePath: file.filePath, now: importedAt, signal, title: target.title
      });
    } finally { await file.dispose(); }
    signal.throwIfAborted();
    const preparedCandidate = candidate;
    await runWithDatabaseConnectionOwner(() => {
      signal.throwIfAborted();
      publish(window, nodeId, operationId, 'locating_highlights', 'Locating highlights…', 0.6);
      const document = buildLocalReadwiseOriginalEpubDocument(target);
      publish(window, nodeId, operationId, 'saving', 'Saving…', 0.9);
      return commitReadwiseOriginalEpub({
        candidate: preparedCandidate, document, expectedSnapshot, importedAt, target
      });
    });
    candidate = null;
    publish(window, nodeId, operationId, 'completed', 'Rebuilt from EPUB.', 1);
    return { node_id: nodeId, status: 'completed' };
  } catch (error) {
    // Published content-addressed images may already belong to another import.
    if (disconnected?.aborted) return { node_id: nodeId, status: 'cancelled' };
    if (candidate) await cleanCreatedManagedAttachmentFiles(candidate.stages);
    const errorCode = readOriginalEpubErrorCode(error);
    console.error('[readwise-original-epub] replacement failed', { errorCode, nodeId });
    publish(window, nodeId, operationId, 'failed', 'The book is unchanged.', 1);
    return { error_code: errorCode, node_id: nodeId, status: 'failed' };
  } finally {
    if (disconnected) finishReadwiseSourceOperation(nodeId);
  }
}

function readOriginalEpubErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z0-9_]+$/u.test(message) ? message.slice(0, 120) : 'original_epub_failed';
}

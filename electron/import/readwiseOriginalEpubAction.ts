import { randomUUID } from 'node:crypto';

import type { BrowserWindow } from 'electron';

import type {
  NativeReadwiseBookEpubProgressEvent,
  NativeReadwiseOriginalEpubActionState,
  NativeReadwiseOriginalEpubResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { cleanCreatedManagedAttachmentFiles } from '../attachments/managedAttachmentFileStage.js';
import { IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { downloadReadwiseOriginalFile } from './readwiseApiOriginalFile.js';
import { mergeRetainedReadwiseAnnotations } from './readwiseOriginalEpubAnnotations.js';
import { commitReadwiseOriginalEpub } from './readwiseOriginalEpubCommit.js';
import { prepareOriginalEpubCandidate, type PreparedOriginalEpubCandidate } from './readwiseOriginalEpubPreparation.js';
import {
  fetchOriginalEpubRemoteAnnotations,
  fetchOriginalEpubRemoteRoot
} from './readwiseOriginalEpubRemote.js';
import {
  assertReadwiseOriginalEpubSourcePristine,
  captureReadwiseOriginalEpubSnapshot,
  isReadwiseOriginalEpubRuntimeReady,
  loadReadwiseOriginalEpubTarget,
  readReadwiseOriginalEpubRuntimeStatus
} from './readwiseOriginalEpubTarget.js';

const runningNodeIds = new Set<string>();

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

export function loadReadwiseOriginalEpubActionState(nodeId: string): NativeReadwiseOriginalEpubActionState {
  const target = loadReadwiseOriginalEpubTarget(nodeId);
  if (!target) return { node_id: nodeId, status: 'not_applicable' };
  if (target.state.bodyAuthority === 'original_epub') return { node_id: nodeId, status: 'completed' };
  if (runningNodeIds.has(nodeId)) return { node_id: nodeId, status: 'running' };
  const runtimeStatus = readReadwiseOriginalEpubRuntimeStatus(target);
  if (runtimeStatus !== 'ready') return { node_id: nodeId, status: runtimeStatus };
  return { node_id: nodeId, status: 'ready' };
}

export async function useReadwiseOriginalEpub(
  nodeId: string,
  window: BrowserWindow | null = null,
  dependencies?: ReadwiseApiFetchDependencies
): Promise<NativeReadwiseOriginalEpubResult> {
  const target = loadReadwiseOriginalEpubTarget(nodeId);
  if (!target) return { node_id: nodeId, status: 'not_applicable' };
  if (target.state.bodyAuthority === 'original_epub') return { node_id: nodeId, status: 'already_completed' };
  if (!isReadwiseOriginalEpubRuntimeReady(target) || runningNodeIds.has(nodeId)) {
    return { node_id: nodeId, status: 'source_inactive' };
  }
  const operationId = randomUUID();
  let candidate: PreparedOriginalEpubCandidate | null = null;
  runningNodeIds.add(nodeId);
  try {
    assertReadwiseOriginalEpubSourcePristine(target);
    const expectedSnapshot = captureReadwiseOriginalEpubSnapshot(target);
    publish(window, nodeId, operationId, 'getting_original', 'Getting original EPUB…', 0);
    const remote = await fetchOriginalEpubRemoteRoot({
      ...(dependencies ? { dependencies } : {}),
      documentId: target.documentId
    });
    publish(window, nodeId, operationId, 'downloading_epub', 'Downloading EPUB…', 0.2);
    const bytes = await downloadReadwiseOriginalFile(remote.rawSourceUrl, 'epub', dependencies);
    publish(window, nodeId, operationId, 'reading_epub', 'Reading EPUB…', 0.35);
    const importedAt = new Date().toISOString();
    candidate = await prepareOriginalEpubCandidate({ bytes, now: importedAt, title: target.title });
    publish(window, nodeId, operationId, 'getting_highlights', 'Getting highlights…', 0.55);
    const fetchedDocument = await fetchOriginalEpubRemoteAnnotations({
      ...(dependencies ? { dependencies } : {}),
      documentId: target.documentId,
      onPage: () => publish(window, nodeId, operationId, 'getting_highlights', 'Getting highlights…', 0.55),
      root: remote.root
    });
    const document = {
      ...fetchedDocument,
      annotations: mergeRetainedReadwiseAnnotations(target, fetchedDocument.annotations)
    };
    publish(window, nodeId, operationId, 'locating_highlights', 'Locating highlights…', 0.7);
    publish(window, nodeId, operationId, 'saving', 'Saving…', 0.9);
    commitReadwiseOriginalEpub({ candidate, document, expectedSnapshot, importedAt, target });
    publish(window, nodeId, operationId, 'completed', 'Original EPUB is now in use.', 1);
    return { node_id: nodeId, status: 'completed' };
  } catch (error) {
    if (candidate) await cleanCreatedManagedAttachmentFiles(candidate.stages);
    const errorCode = error instanceof Error ? error.message : 'original_epub_failed';
    publish(window, nodeId, operationId, 'failed', 'The book is unchanged.', 1);
    return { error_code: errorCode, node_id: nodeId, status: 'failed' };
  } finally {
    runningNodeIds.delete(nodeId);
  }
}

import { completeFolderAttachmentCopy } from '../../lib/core/database/companionFolderAttachmentWork';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { invalidateAttachmentResourceResolution } from '../shared/platform/attachmentResources';
import { setCompanionEpubReadingMode } from '../shared/platform/companion/runtime/companionEpubReadingMode';
import { publishCompanionImportedFile, publishCompanionImportedFiles } from '../shared/platform/companion/runtime/companionFileImportPublication';
import { runCompanionHistoryMutation } from '../shared/platform/companion/runtime/companionFlowHistory';
import { completeCompanionPdfTextImport } from '../shared/platform/companion/runtime/companionImportedPdfText';
import { persistCompanionImportedTextWithDb } from '../shared/platform/companion/runtime/companionImportedText';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { prepareSelectedTextImport, type SelectedImportFile, type SelectedImportWarning, type PreparedSelectedFileImport } from '../shared/platform/import/selectedImportFile';

import { assertCaptureParentAvailable, getCompanionCaptureTextErrorCode } from './companionCaptureTextActions';
import type { CompanionCaptureTextSaveError, CompanionCaptureTextSaveResult } from './companionCaptureTextController';
import type { CompanionEpubReadingModeChoice } from './useCompanionEpubReadingMode';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type ImportedFileOutcome = { nodeId: string; importWarning?: SelectedImportWarning; epubReadingMode?: CompanionEpubReadingModeChoice; interrupted?: true }
  | { error: CompanionCaptureTextSaveError };

/** Imports the chosen files one after another and refreshes the workspace once for the whole batch. */
export function createCompanionFileImportHandler(workspace: Pick<ReturnType<typeof useCompanionWorkspaceSync>, 'refreshAfterMutation'>,
  parentNodeId = INBOX_NODE_ID) {
  return async (selection: SelectedImportFile | readonly SelectedImportFile[], signal?: AbortSignal): Promise<CompanionCaptureTextSaveResult> => {
    const files = Array.isArray(selection) ? selection : [selection as SelectedImportFile];
    const owner = getIosCompanionDatabaseOwner();
    const refresh = () => {
      if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
      return workspace.refreshAfterMutation();
    };
    const imported: Extract<ImportedFileOutcome, { nodeId: string }>[] = [];
    let firstError: CompanionCaptureTextSaveError | null = null;
    let failedFileCount = 0;
    for (const file of files) {
      if (signal?.aborted || owner !== getIosCompanionDatabaseOwner()) break;
      const outcome = await importSelectedFile(file, parentNodeId, owner, signal);
      if ('error' in outcome) { failedFileCount += 1; firstError ??= outcome.error; }
      else imported.push(outcome);
    }
    const last = imported.at(-1);
    if (!last) return { error: firstError ?? 'save-failed' };
    const importWarning = imported.find(item => item.importWarning)?.importWarning;
    const epubReadingModes = imported.flatMap(item => item.epubReadingMode ? [item.epubReadingMode] : []);
    const result = { nodeId: last.nodeId, ...(importWarning ? { importWarning } : {}),
      ...(epubReadingModes.length ? { epubReadingModes } : {}), ...(failedFileCount ? { failedFileCount } : {}) };
    // A file that committed but failed afterwards leaves the refresh to the user's explicit retry.
    if (imported.some(item => item.interrupted)) return { ...result, retryRefresh: refresh };
    try { await refresh(); }
    catch { return { ...result, retryRefresh: refresh }; }
    return result;
  };
}

async function importSelectedFile(file: SelectedImportFile, parentNodeId: string,
  owner: ReturnType<typeof getIosCompanionDatabaseOwner>, signal: AbortSignal | undefined): Promise<ImportedFileOutcome> {
  const committed = { nodeId: null as string | null };
  let epubReadingMode: CompanionEpubReadingModeChoice | undefined;
  let importWarning: SelectedImportWarning | undefined;
  const outcome = () => ({ nodeId: committed.nodeId!, ...(importWarning ? { importWarning } : {}), ...(epubReadingMode ? { epubReadingMode } : {}) });
  try {
    signal?.throwIfAborted();
    const prepared = await prepareSelectedTextImport(file, signal);
    importWarning = prepared.importWarning;
    signal?.throwIfAborted();
    const commit = () => persistSelectedFile(prepared, file, parentNodeId, owner, signal, node => {
      committed.nodeId = node.id;
      if (prepared.epubBook) {
        const bookOwner = owner;
        epubReadingMode = { fileName: file.name, apply: mode => setCompanionEpubReadingMode(node.id, mode === 'sequential', bookOwner) };
      }
    });
    const node = prepared.pdfSource ? await publishCompanionImportedFile(prepared.pdfSource, commit, owner, signal)
      : await publishCompanionImportedFiles(bodyImageFiles(prepared), commit, owner, signal);
    committed.nodeId = node.id;
    if (prepared.pdfSource) await completeCompanionPdfTextImport(prepared.pdfSource, node.id, owner, signal);
    return outcome();
  } catch (error) {
    if (committed.nodeId) return { ...outcome(), interrupted: true };
    return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
  }
}

/** Attachments the stored bodies point at; they are published before the topics are committed. */
function bodyImageFiles(prepared: PreparedSelectedFileImport) {
  return prepared.epubBook?.files ?? prepared.inlineImageFiles ?? [];
}

function persistSelectedFile(prepared: PreparedSelectedFileImport, file: SelectedImportFile, parentNodeId: string,
  owner: ReturnType<typeof getIosCompanionDatabaseOwner>, signal: AbortSignal | undefined, onCommitted: (node: { id: string }) => void) {
  return runCompanionHistoryMutation(async db => {
    signal?.throwIfAborted();
    if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
    await assertCaptureParentAvailable(db, parentNodeId);
    if (prepared.pdfSource) invalidateAttachmentResourceResolution(prepared.pdfSource.storageKey);
    const imported = await persistCompanionImportedTextWithDb(db, prepared, parentNodeId,
      prepared.pdfSource ? [{ storage_key: prepared.pdfSource.storageKey, original_name: file.name, role: 'reference' }]
        : prepared.epubBook?.resources ?? prepared.localizedImageResources ?? [],
      prepared.epubBook?.chapters);
    if (prepared.pdfSource) {
      await recordFramedSyncResourceAvailability(db, [prepared.pdfSource.storageKey.slice(0, 64)], true);
      await completeFolderAttachmentCopy(db, prepared.pdfSource.storageKey);
    }
    for (const resource of bodyImageFiles(prepared)) {
      invalidateAttachmentResourceResolution(resource.storageKey);
      await recordFramedSyncResourceAvailability(db, [resource.storageKey.slice(0, 64)], true);
      await completeFolderAttachmentCopy(db, resource.storageKey);
    }
    signal?.throwIfAborted();
    return imported;
  }, { kind: 'full' }, onCommitted);
}

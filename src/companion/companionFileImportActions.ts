import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { invalidateAttachmentResourceResolution } from '../shared/platform/attachmentResources';
import { publishCompanionImportedFile } from '../shared/platform/companion/runtime/companionFileImportPublication';
import { runCompanionHistoryMutation } from '../shared/platform/companion/runtime/companionFlowHistory';
import { persistCompanionImportedTextWithDb } from '../shared/platform/companion/runtime/companionImportedText';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { prepareSelectedTextImport, type SelectedImportFile, type SelectedImportWarning } from '../shared/platform/import/selectedImportFile';

import { assertCaptureParentAvailable, getCompanionCaptureTextErrorCode } from './companionCaptureTextActions';
import type { CompanionCaptureTextSaveResult } from './companionCaptureTextController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function createCompanionFileImportHandler(workspace: Pick<ReturnType<typeof useCompanionWorkspaceSync>, 'refreshAfterMutation'>,
  parentNodeId = INBOX_NODE_ID) {
  return async (file: SelectedImportFile, signal?: AbortSignal): Promise<CompanionCaptureTextSaveResult> => {
    const committed = { nodeId: null as string | null };
    let importWarning: SelectedImportWarning | undefined;
    let owner: ReturnType<typeof getIosCompanionDatabaseOwner> | undefined;
    const refresh = () => {
      if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
      return workspace.refreshAfterMutation();
    };
    try {
      signal?.throwIfAborted();
      owner = getIosCompanionDatabaseOwner();
      const prepared = await prepareSelectedTextImport(file);
      importWarning = prepared.importWarning;
      signal?.throwIfAborted();
      const commit = () => runCompanionHistoryMutation(async db => {
        signal?.throwIfAborted();
        if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
        await assertCaptureParentAvailable(db, parentNodeId);
        if (prepared.pdfSource) invalidateAttachmentResourceResolution(prepared.pdfSource.storageKey);
        const imported = await persistCompanionImportedTextWithDb(db, prepared, parentNodeId,
          prepared.pdfSource ? [{ storage_key: prepared.pdfSource.storageKey, original_name: file.name, role: 'reference' }] : []);
        if (prepared.pdfSource) {
          await recordFramedSyncResourceAvailability(db, [prepared.pdfSource.storageKey.slice(0, 64)], true);
        }
        signal?.throwIfAborted();
        return imported;
      }, { kind: 'full' }, node => { committed.nodeId = node.id; });
      const node = prepared.pdfSource ? await publishCompanionImportedFile(prepared.pdfSource, commit, owner, signal) : await commit();
      try { await refresh(); }
      catch { return { nodeId: node.id, retryRefresh: refresh, ...(importWarning ? { importWarning } : {}) }; }
      return { nodeId: node.id, ...(importWarning ? { importWarning } : {}) };
    } catch (error) {
      if (committed.nodeId) return { nodeId: committed.nodeId, retryRefresh: refresh, ...(importWarning ? { importWarning } : {}) };
      return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
    }
  };
}

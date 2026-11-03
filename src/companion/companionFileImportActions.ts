import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
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
      const node = await runCompanionHistoryMutation(async db => {
        signal?.throwIfAborted();
        if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
        await assertCaptureParentAvailable(db, parentNodeId);
        const imported = await persistCompanionImportedTextWithDb(db, prepared, parentNodeId);
        signal?.throwIfAborted();
        return imported;
      }, { kind: 'full' }, node => { committed.nodeId = node.id; });
      try { await refresh(); }
      catch { return { nodeId: node.id, retryRefresh: refresh, ...(importWarning ? { importWarning } : {}) }; }
      return { nodeId: node.id, ...(importWarning ? { importWarning } : {}) };
    } catch (error) {
      if (committed.nodeId) return { nodeId: committed.nodeId, retryRefresh: refresh, ...(importWarning ? { importWarning } : {}) };
      return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
    }
  };
}

import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import type { CompanionContentEdit, CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { readCompanionContentSource, releaseCompanionContentBase, retainCompanionContentBase, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { ContentSavedRefreshError } from '../shared/platform/companion/editing/contentSavedRefreshError';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { persistCompanionTopicContent } from './companionTopicEditingActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function createCompanionTopicContentSaveHandler(workspaceSync: CompanionWorkspaceSyncApi): CompanionContentSaveHandler {
  const scope = getCompanionReadingScope();
  const requireCurrentScope = () => {
    if (scope !== getCompanionReadingScope()) throw new Error('The library changed. Reopen the topic before saving.');
  };
  let previewSnapshot = workspaceSync.state.workspace_snapshot;
  const readSource: CompanionContentSaveHandler['readSource'] = async (nodeId, holdId) => {
    requireCurrentScope();
    if (isAvailableNativeCompanionRuntime()) return readCompanionContentSource(nodeId, holdId);
    const node = previewSnapshot?.nodesById[nodeId];
    if (!node?.currentVersionId) throw new Error('Topic edit requires a synced base version.');
    return { content: node.content, versionId: node.currentVersionId };
  };
  const save: CompanionContentSaveHandler = Object.assign(async (nodeId: string, content: string, edit?: CompanionContentEdit) => {
    requireCurrentScope();
    if (isAvailableNativeCompanionRuntime()) {
      const input = edit ?? { nodeId, content, baseVersionId: (await readSource(nodeId)).versionId,
        versionId: createOpaqueVersionRef(createCompanionUuid()), updatedAt: new Date().toISOString() };
      requireCurrentScope();
      const acknowledgement = await saveCompanionContentEdit(input);
      const refresh = () => { requireCurrentScope(); return workspaceSync.refreshAfterMutation(); };
      try { await refresh(); }
      catch { throw new ContentSavedRefreshError(acknowledgement, refresh); }
      return acknowledgement;
    }
    const result = await persistCompanionTopicContent({
      content, deviceId: workspaceSync.bootstrapState.device_id, nodeId,
      snapshot: previewSnapshot
    });
    if (!result) throw new Error('This topic cannot be edited on this device.');
    previewSnapshot = result.snapshot;
    await workspaceSync.refreshAfterMutation(result.snapshot);
    const currentVersionId = result.snapshot.nodesById[nodeId]!.currentVersionId!;
    return { content, currentVersionId, submittedVersionId: currentVersionId };
  }, {
    readSource,
    retainHold: async (nodeId: string, versionId: string, holdId: string) => {
      requireCurrentScope();
      if (isAvailableNativeCompanionRuntime()) await retainCompanionContentBase(nodeId, versionId, holdId);
    },
    releaseHold: async (nodeId: string, holdId: string) => {
      if (scope !== getCompanionReadingScope()) return;
      if (isAvailableNativeCompanionRuntime()) await releaseCompanionContentBase(nodeId, holdId);
    }
  });
  return save;
}

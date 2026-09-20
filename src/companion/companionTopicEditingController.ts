import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import type { CompanionContentEdit, CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { persistCompanionTopicContent } from './companionTopicEditingActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function createCompanionTopicContentSaveHandler(workspaceSync: CompanionWorkspaceSyncApi): CompanionContentSaveHandler {
  let previewSnapshot = workspaceSync.state.workspace_snapshot;
  const readSource: CompanionContentSaveHandler['readSource'] = async (nodeId) => {
    if (isAvailableNativeCompanionRuntime()) return readCompanionContentSource(nodeId);
    const node = previewSnapshot?.nodesById[nodeId];
    if (!node?.currentVersionId) throw new Error('Topic edit requires a synced base version.');
    return { content: node.content, versionId: node.currentVersionId };
  };
  const save: CompanionContentSaveHandler = Object.assign(async (nodeId: string, content: string, edit?: CompanionContentEdit) => {
    if (isAvailableNativeCompanionRuntime()) {
      const input = edit ?? { nodeId, content, baseVersionId: (await readSource(nodeId)).versionId,
        versionId: createOpaqueVersionRef(createCompanionUuid()), updatedAt: new Date().toISOString() };
      const acknowledgement = await saveCompanionContentEdit(input);
      await workspaceSync.refreshFromDevice();
      return acknowledgement;
    }
    const result = await persistCompanionTopicContent({
      content, deviceId: workspaceSync.bootstrapState.device_id, nodeId,
      snapshot: previewSnapshot
    });
    if (!result) throw new Error('This topic cannot be edited on this device.');
    previewSnapshot = result.snapshot;
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
    const currentVersionId = result.snapshot.nodesById[nodeId]!.currentVersionId!;
    return { content, currentVersionId, submittedVersionId: currentVersionId };
  }, { readSource });
  return save;
}

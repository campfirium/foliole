import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import { companionWorkspaceReadTotals } from '../shared/platform/companion/companionWorkspaceSnapshotRefresh';
import type { CompanionContentEdit, CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { readCompanionContentSource, releaseCompanionContentBase, retainCompanionContentBase, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { companionTextHistorySource } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { ContentSavedRefreshError } from '../shared/platform/companion/editing/contentSavedRefreshError';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { traceCompanionSyncEvent } from '../shared/platform/companion/sync/diagnostics/companionDesktopSyncTrace';
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
    return { ...(node.kind === 'item' ? { reveal: node.reveal ?? null } : {}), content: node.content, versionId: node.currentVersionId };
  };
  const save: CompanionContentSaveHandler = Object.assign(async (nodeId: string, content: string, edit?: CompanionContentEdit) => {
    requireCurrentScope();
    if (isAvailableNativeCompanionRuntime()) {
      const input = edit ?? { nodeId, content, baseVersionId: (await readSource(nodeId)).versionId,
        versionId: createOpaqueVersionRef(createCompanionUuid()), updatedAt: new Date().toISOString() };
      requireCurrentScope();
      const startedAt = performance.now();
      const acknowledgement = await saveCompanionContentEdit(input);
      const savedAt = performance.now();
      const reads = companionWorkspaceReadTotals();
      const refresh = () => { requireCurrentScope(); return workspaceSync.refreshAfterMutation(undefined, nodeId); };
      try { await refresh(); }
      catch { throw new ContentSavedRefreshError(acknowledgement, refresh); }
      // Splits a body save into its write and the refresh after it, and how long that refresh waited behind other
      // database work, so a slow save shows which part held it up.
      const after = companionWorkspaceReadTotals();
      traceCompanionSyncEvent('content_save', 'completed', { saveMs: Math.round(savedAt - startedAt),
        refreshMs: Math.round(performance.now() - savedAt), refreshReads: after.reads - reads.reads,
        refreshQueueMs: Math.round(after.queueMs - reads.queueMs), refreshReadMs: Math.round(after.readMs - reads.readMs) });
      return acknowledgement;
    }
    const result = await persistCompanionTopicContent({
      content, deviceId: workspaceSync.bootstrapState.device_id, nodeId,
      ...(edit?.reveal === undefined ? {} : { reveal: edit.reveal }),
      snapshot: previewSnapshot
    });
    if (!result) throw new Error('This topic cannot be edited on this device.');
    previewSnapshot = result.snapshot;
    await workspaceSync.refreshAfterMutation(result.snapshot);
    const currentVersionId = result.snapshot.nodesById[nodeId]!.currentVersionId!;
    return { ...(result.snapshot.nodesById[nodeId]?.kind === 'item' ? { reveal: result.snapshot.nodesById[nodeId]?.reveal ?? null } : {}),
      content, currentVersionId, submittedVersionId: currentVersionId };
  }, {
    readSource,
    historySource: (nodeId: string | null, field: 'content' | 'reveal') =>
      scope === getCompanionReadingScope() && isAvailableNativeCompanionRuntime() ? companionTextHistorySource(nodeId, field) : null,
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

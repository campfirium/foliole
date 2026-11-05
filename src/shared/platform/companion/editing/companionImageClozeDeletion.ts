import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { removeDeletedNodeImageRegions, removeImageClozeRegion } from '../../../../../lib/core/nodes/imageRegionRemoval';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { pushEditorOperationEntry } from '../../../../features/editor/model/editorOperationHistory';
import { findLiveImageClozeChildNodeIds } from '../../../../features/image-cloze/model/imageClozeDeleteTargets';
import { canCreateSelectionAnnotation } from '../../../selectionAnnotationEligibility';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { loadCompanionWorkspaceNodeFromDb } from '../runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { readCompanionHistoryReview } from './companionEditHistoryRecording';
import { readCompanionEditHistoryFromDb, writeCompanionEditHistory } from './companionEditHistoryRepository';
import type { CompanionImageClozeRequest } from './companionImageCloze';

type Request = Pick<CompanionImageClozeRequest, 'parentNodeId' | 'expectedContent' | 'expectedVersionId' | 'scope'> & {
  attachmentId: string; regionId: string;
};

export function deleteCompanionImageCloze(request: Request) {
  const assertScope = () => { if (request.scope !== getCompanionReadingScope()) throw new Error('image_cloze_library_changed'); };
  assertScope();
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(db => db.transaction(async tx => {
    assertScope();
    const parent = await loadCompanionWorkspaceNodeFromDb(tx, request.parentNodeId);
    if (!parent || parent.deletedAt || !canCreateSelectionAnnotation(parent) || parent.content !== request.expectedContent) throw new Error('image_cloze_source_changed');
    const rows = await tx.query<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [parent.id]);
    const children = (await Promise.all(rows.map(row => loadCompanionWorkspaceNodeFromDb(tx, row.id)))).filter((node): node is WorkspaceNodeSnapshot => Boolean(node));
    const targets = findLiveImageClozeChildNodeIds({ nodesById: Object.fromEntries([parent, ...children].map(node => [node.id, node])), trashedNodeIds: [] }, parent.id, request.attachmentId, request.regionId);
    if (!targets.length && !parent.imageRegions?.some(group => group.attachmentId === request.attachmentId && group.regions.some(region => region.id === request.regionId))) return parent.currentVersionId ?? null;
    if ((parent.currentVersionId ?? null) !== request.expectedVersionId) throw new Error('image_cloze_source_changed');
    const affected = new Map<string, WorkspaceNodeSnapshot>();
    for (const target of targets) {
      const subtree = await tx.query<{ id: string }>(`WITH RECURSIVE subtree(id) AS (
        SELECT id FROM nodes WHERE id = ? UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL
      ) SELECT id FROM subtree`, [target]);
      for (const row of subtree) {
        const node = await loadCompanionWorkspaceNodeFromDb(tx, row.id);
        if (node && !node.deletedAt) affected.set(node.id, node);
      }
    }
    const now = new Date().toISOString();
    const host = await iosCompanionHostName(tx);
    let regions = removeImageClozeRegion(parent.imageRegions, request.attachmentId, request.regionId);
    for (const node of affected.values()) regions = removeDeletedNodeImageRegions(regions, node) ?? null;
    const parentVersion = regions === parent.imageRegions ? null : await toWorkspaceNativeNodeVersion({ ...parent, imageRegions: regions, updatedAt: now }, host);
    const versions = await Promise.all([...affected.values()].map(node => toWorkspaceNativeNodeVersion({ ...node, deletedAt: now, updatedAt: now }, host)));
    const history = await readCompanionEditHistoryFromDb(tx);
    const annotations = await Promise.all([...affected.values()].map(async node => ({ nodeId: node.id, parentNodeId: node.parentNodeId!, kind: 'cloze' as const,
      beforeVersionId: node.currentVersionId!, afterVersionId: versions.find(version => version.object_id === node.id)!.version_id!,
      review: await readCompanionHistoryReview(tx, node.id) })));
    assertScope();
    const applied = await applySyncNodesWithDbPort(tx, [...versions, ...(parentVersion ? [parentVersion] : [])], { operation: 'local_mutation', enqueueSearchInvalidations: false });
    if (applied.appliedIds.length !== versions.length + Number(Boolean(parentVersion))) throw new Error('image_cloze_delete_not_saved');
    if (annotations.length) await writeCompanionEditHistory(tx, history, pushEditorOperationEntry(history, { nodeId: parent.id, type: 'annotation.delete', title: 'Delete Annotation', canonical: 'confirmed', annotations }));
    return parentVersion?.version_id ?? parent.currentVersionId ?? null;
  })), { kind: 'full' });
}

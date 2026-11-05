import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { invalidateEditorOperationSession } from '../../../../features/editor/model/editorOperationHistory';
import { getImageClozeLocator, listImageClozePresentationRegions } from '../../../../features/image-cloze/model/imageCloze';
import { findLiveImageClozeChildNodeIds } from '../../../../features/image-cloze/model/imageClozeDeleteTargets';
import { patchImageClozeRegion, sameImageClozeRect } from '../../../../features/image-cloze/model/imageClozeRegionEdit';
import { canCreateSelectionAnnotation } from '../../../selectionAnnotationEligibility';
import { loadCompanionWorkspaceNodeFromDb } from '../runtime/companionWorkspaceNodeStore';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';

import { readCompanionEditHistoryFromDb, writeCompanionEditHistory } from './companionEditHistoryRepository';
import type { CompanionImageClozeRequest } from './companionImageCloze';

export async function applyCompanionImageClozeRegionEdits(db: DbPort, request: CompanionImageClozeRequest) {
  const parent = await loadCompanionWorkspaceNodeFromDb(db, request.parentNodeId);
  const version = await loadCurrentSyncNodeRecord(db, request.parentNodeId);
  if (!parent || parent.deletedAt || !canCreateSelectionAnnotation(parent) || parent.content !== request.expectedContent) throw new Error('image_cloze_source_changed');
  const edits = request.edits ?? [];
  const changed = new Map<string, WorkspaceNodeSnapshot>();
  const originals = new Map([[parent.id, parent]]);
  let alreadyApplied = edits.length > 0;
  if (edits.length) {
    const rows = await db.query<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [parent.id]);
    const children = (await Promise.all(rows.map(row => loadCompanionWorkspaceNodeFromDb(db, row.id)))).filter((node): node is WorkspaceNodeSnapshot => Boolean(node));
    for (const child of children) originals.set(child.id, child);
    const nodesById = Object.fromEntries([parent, ...children].map(node => [node.id, node]));
    for (const edit of edits) {
      const targets = findLiveImageClozeChildNodeIds({ nodesById, trashedNodeIds: [] }, parent.id, edit.before.attachmentId, edit.before.id);
      if (!targets.length) throw new Error('image_cloze_region_changed');
      for (const id of targets) {
        const node = nodesById[id]!;
        const region = listImageClozePresentationRegions(node.imageRegions).find(value => value.id === edit.before.id && value.attachmentId === edit.before.attachmentId) ?? getImageClozeLocator(node.anchorLink);
        if (!region || (!sameImageClozeRect(region, edit.before) && !sameImageClozeRect(region, edit.after))) throw new Error('image_cloze_region_changed');
        alreadyApplied = alreadyApplied && sameImageClozeRect(region, edit.after);
        changed.set(id, patchImageClozeRegion(changed.get(id) ?? node, edit));
      }
      changed.set(parent.id, patchImageClozeRegion(changed.get(parent.id) ?? parent, edit));
    }
  }
  if ((version?.version_id ?? null) !== request.expectedVersionId && !alreadyApplied) throw new Error('image_cloze_source_changed');
  const nodes = [...changed.values()].filter(node => {
    const original = originals.get(node.id);
    return !original || JSON.stringify(node.imageRegions ?? null) !== JSON.stringify(original.imageRegions ?? null) || JSON.stringify(node.anchorLink) !== JSON.stringify(original.anchorLink);
  });
  if (nodes.length) {
    const host = await iosCompanionHostName(db);
    const versions = await Promise.all(nodes.map(node => toWorkspaceNativeNodeVersion({ ...node, updatedAt: new Date().toISOString() }, host)));
    const result = await applySyncNodesWithDbPort(db, versions, { operation: 'local_mutation', enqueueSearchInvalidations: false });
    if (result.appliedIds.length !== versions.length) throw new Error('image_cloze_edit_not_saved');
    const history = await readCompanionEditHistoryFromDb(db);
    await writeCompanionEditHistory(db, history, invalidateEditorOperationSession(history, { nodeId: parent.id, reason: 'external-content-change' }));
  }
  return parent;
}

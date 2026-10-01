import { parseImageSources, serializeImageSources } from '../../../../../lib/core/database/imageSources';
import { parseNodeResourceReferences, serializeNodeResourceReferences, upsertNodeResourceReference, type NodeResourceReference } from '../../../../../lib/core/database/nodeResourceReferences';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { RecoverableImageArticle } from '../../../../../lib/core/import/articleImageRecovery';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import {
  loadCompanionWorkspaceNode,
  loadCompanionWorkspaceNodeFromDb
} from './companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function readCompanionImageArticle(nodeId: string) {
  return loadCompanionWorkspaceNode(nodeId).then((node): RecoverableImageArticle | null => {
    return node ? { content: node.content, imageSources: parseImageSources(node.imageSources) } : null;
  });
}

export function commitCompanionImageArticle(nodeId: string, before: RecoverableImageArticle, after: RecoverableImageArticle, resource?: NodeResourceReference) {
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(async (db) => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, nodeId);
    if (!node || node.content !== before.content ||
        serializeImageSources(node.imageSources ?? {}) !== serializeImageSources(before.imageSources)) return false;
    const version = await toWorkspaceNativeNodeVersion({
      ...node, content: after.content, imageSources: after.imageSources,
      resourceReferences: resource ? parseNodeResourceReferences(upsertNodeResourceReference(serializeNodeResourceReferences(node.resourceReferences ?? []), resource)) : node.resourceReferences ?? [],
      openingText: resolveNodeOpeningText(after.content, node.title), updatedAt: new Date().toISOString()
    }, await iosCompanionHostName(db));
    const result = await applySyncNodesWithDbPort(db, [version], { operation: 'local_mutation', enqueueSearchInvalidations: false });
    return result.appliedIds.includes(nodeId);
  }));
}

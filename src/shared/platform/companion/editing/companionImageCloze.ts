import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { parseAssetMarkdownUrl } from '../../../../../lib/platform/assetMarkdownUrl';
import { parseCanonicalAttachmentStorageKey } from '../../../../../lib/platform/attachmentResource';
import { collectImageMatches } from '../../../../features/editor/model/markdownImageMatches';
import { buildImageClozeSourcePayload, type ImageClozeDraftRegion } from '../../../../features/image-cloze/model/imageCloze';
import { imageClozeNodeFields } from '../../../../features/image-cloze/model/imageClozeDraft';
import type { ImageClozeRegionEdit } from '../../../../features/image-cloze/model/imageClozeRegionEdit';
import { deriveNodeTitleForCloze } from '../../../../features/nodes/model/deriveNodeTitle';
import { createNewItemReviewProfiles } from '../../../../store/newItemReviewSlots';
import { assertNodeTextForSave } from '../../../ui/nodeTextSaveBudget';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState } from '../../companionWorkspaceSync';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { loadCompanionWorkspaceNodeFromDb } from '../runtime/companionWorkspaceNodeStore';
import { saveIosReviewWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { recordCompanionAnnotationHistory } from './companionEditHistoryRecording';
import { applyCompanionImageClozeRegionEdits } from './companionImageClozeRegionEdits';


export interface CompanionImageClozeRequest {
  nodeId: string;
  parentNodeId: string;
  expectedContent: string;
  expectedVersionId: string | null;
  imageRange: { from: number; to: number };
  regions: ImageClozeDraftRegion[];
  edits?: ImageClozeRegionEdit[];
  scope: ReturnType<typeof getCompanionReadingScope>;
}

function sourceForRequest(request: CompanionImageClozeRequest) {
  const match = collectImageMatches(0, request.expectedContent).find(image =>
    image.from === request.imageRange.from && image.to === request.imageRange.to);
  const key = match && parseAssetMarkdownUrl(match.source);
  const source = buildImageClozeSourcePayload(request.expectedContent, request.imageRange);
  const hash = key ? parseCanonicalAttachmentStorageKey(key)?.contentHash : null;
  const regions = [...request.regions, ...(request.edits ?? []).flatMap(edit => [edit.before, edit.after])];
  if (request.edits?.some(edit => edit.before.id !== edit.after.id || edit.before.attachmentId !== edit.after.attachmentId)) throw new Error('image_cloze_invalid_edit');
  if (!key || !hash || !source || !regions.length || regions.some(region =>
    region.attachmentId !== hash || ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
    region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 ||
    region.x + region.width > 1.000001 || region.y + region.height > 1.000001)) throw new Error('image_cloze_invalid_source');
  return { key, hash, source };
}

export async function saveCompanionImageCloze(request: CompanionImageClozeRequest) {
  const { key, hash, source } = sourceForRequest(request);
  const fields = request.regions.length ? imageClozeNodeFields(hash, source, request.regions) : null;
  const assertScope = () => {
    if (request.scope !== getCompanionReadingScope()) throw new Error('image_cloze_library_changed');
  };
  assertScope();
  const identity = parseCanonicalAttachmentStorageKey(key)!;
  const resource = await FolioleCompanionSync.resolveAttachmentResource({ attachment_id: hash, content_hash: hash, mime_type: identity.mimeType, storage_key: key });
  if (resource?.status !== 'ready') throw new Error('image_cloze_image_missing');
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const now = new Date().toISOString();
  const review = createNewItemReviewProfiles({ batchSize: 1, nodesById: snapshot?.nodesById ?? {}, now })[0]!;
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(db => db.transaction(async tx => {
    assertScope();
    const parent = await applyCompanionImageClozeRegionEdits(tx, request);
    assertScope();
    if (!fields) return null;
    const existing = await loadCompanionWorkspaceNodeFromDb(tx, request.nodeId);
    if (existing) {
      if (existing.deletedAt || existing.parentNodeId !== request.parentNodeId || existing.content !== fields.content ||
        existing.reveal !== fields.reveal || JSON.stringify(existing.imageRegions) !== JSON.stringify(fields.imageRegions)) {
        throw new Error('image_cloze_request_mismatch');
      }
      return existing.id;
    }
    const node: WorkspaceNodeSnapshot = {
      ...fields, id: request.nodeId, parentNodeId: parent.id, title: deriveNodeTitleForCloze(fields.content, fields.reveal),
      isTitleManual: false, hideTitleHeading: false, reading: null, review, createdAt: now, updatedAt: now,
      imageSources: parent.imageSources?.[key] ? { [key]: parent.imageSources[key] } : {},
      resourceReferences: parent.resourceReferences?.filter(reference => reference.storage_key === key) ?? []
    };
    assertNodeTextForSave(node);
    const version = await toWorkspaceNativeNodeVersion(node, await iosCompanionHostName(tx));
    const applied = await applySyncNodesWithDbPort(tx, [version], { operation: 'local_mutation', enqueueSearchInvalidations: false });
    if (!applied.appliedIds.includes(node.id)) throw new Error('image_cloze_not_saved');
    await saveIosReviewWithDb(tx, { node_id: node.id, review_json: JSON.stringify(review) });
    await recordCompanionAnnotationHistory(tx, { documentId: parent.id, before: null, after: { ...node, currentVersionId: version.version_id } });
    return node.id;
  })), { kind: 'full' });
}

export async function createCompanionImageCloze(request: CompanionImageClozeRequest) {
  if (!request.regions.length) throw new Error('image_cloze_invalid_source');
  const id = await saveCompanionImageCloze(request);
  if (!id) throw new Error('image_cloze_not_saved');
  return id;
}

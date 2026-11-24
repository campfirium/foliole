import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { createInitialNewItemReviewProfile } from '../../../../../lib/core/review/newItemReviewSlots';
import { applyLocalNodeVersionsWithDbPort } from '../../../../../lib/core/sync/localNodeVersionApply';
import { loadCurrentSyncNodeRecordsInOneRead } from '../../../../../lib/core/sync/syncNodeGraphOneRead';
import {
  buildFormulaClozeSourcePayload,
  deriveFormulaClozeSelectionLabel,
  type FormulaClozeCreatePayload
} from '../../../../features/formula-cloze/model/formulaCloze';
import { deriveNodeTitleForCloze } from '../../../../features/nodes/model/deriveNodeTitle';
import type { FormulaDomSelectionDescriptor } from '../../../../features/nodes/model/nodeTypes';
import { allocateNewItemReviewDueDates } from '../../../../store/newItemReviewSlots';
import { canCreateSelectionAnnotation } from '../../../selectionAnnotationEligibility';
import { assertNodeTextForSave } from '../../../ui/nodeTextSaveBudget';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { loadNewItemReviewLoadWithDb } from '../runtime/companionNewItemReviewLoad';
import { loadCompanionWorkspaceNodeFromDb } from '../runtime/companionWorkspaceNodeStore';
import { saveIosReviewWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { recordCompanionAnnotationHistory } from './companionEditHistoryRecording';

export interface CompanionFormulaClozeRegion {
  /** Stable per drawn region so a retried save finds the Items it already created. */
  nodeId: string;
  anchorId: string;
  selection: FormulaDomSelectionDescriptor;
}

export interface CompanionFormulaClozeRequest extends Omit<FormulaClozeCreatePayload, 'selection'> {
  parentNodeId: string;
  expectedContent: string;
  expectedVersionId: string | null;
  regions: CompanionFormulaClozeRegion[];
  scope: ReturnType<typeof getCompanionReadingScope>;
}

function formulaClozeNode(request: CompanionFormulaClozeRequest, region: CompanionFormulaClozeRegion,
  source: { promptContent: string; revealContent: string }, review: WorkspaceNodeSnapshot['review'], now: string): WorkspaceNodeSnapshot {
  return {
    id: region.nodeId, parentNodeId: request.parentNodeId, kind: 'item',
    title: deriveFormulaClozeSelectionLabel(region.selection) || deriveNodeTitleForCloze(source.promptContent, source.revealContent),
    isTitleManual: false, hideTitleHeading: false, reading: null, review, createdAt: now, updatedAt: now,
    content: source.promptContent, reveal: source.revealContent,
    anchorLink: { id: region.anchorId, kind: 'cloze', locator: {
      kind: 'formula-region', display: request.display, fallbackRect: region.selection.fallbackRect,
      formulaSource: request.formulaSource, occurrenceKey: request.occurrenceKey, selection: region.selection
    } },
    imageSources: {}, resourceReferences: []
  };
}

// Stored anchor links come back with their keys in storage order.
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);

function sameFormulaCloze(existing: WorkspaceNodeSnapshot, expected: WorkspaceNodeSnapshot) {
  return !existing.deletedAt && existing.parentNodeId === expected.parentNodeId && existing.content === expected.content &&
    existing.reveal === expected.reveal && canonical(existing.anchorLink) === canonical(expected.anchorLink);
}

function validRegion(region: CompanionFormulaClozeRegion) {
  const rect = region.selection.fallbackRect;
  return region.selection.leaves.length > 0 && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0;
}

/** Creates one formula cloze Item per region under the source topic, in one write; returns the created Item ids. */
export async function createCompanionFormulaCloze(request: CompanionFormulaClozeRequest) {
  const source = buildFormulaClozeSourcePayload(request.expectedContent, request.formulaRange);
  if (!source || request.expectedContent.slice(request.formulaRange.from, request.formulaRange.to) !== request.formulaSource ||
    !request.occurrenceKey.trim() || !request.regions.length || !request.regions.every(validRegion)) {
    throw new Error('formula_cloze_invalid_source');
  }
  const assertScope = () => {
    if (request.scope !== getCompanionReadingScope()) throw new Error('formula_cloze_library_changed');
  };
  assertScope();
  const now = new Date().toISOString();
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(db => db.transaction(async tx => {
    assertScope();
    const parent = await loadCompanionWorkspaceNodeFromDb(tx, request.parentNodeId);
    const version = (await loadCurrentSyncNodeRecordsInOneRead(tx, [request.parentNodeId])).get(request.parentNodeId);
    if (!parent || parent.deletedAt || !canCreateSelectionAnnotation(parent) || parent.content !== request.expectedContent) {
      throw new Error('formula_cloze_source_changed');
    }
    const existing = await Promise.all(request.regions.map(region => loadCompanionWorkspaceNodeFromDb(tx, region.nodeId)));
    // A retry after a committed write finds every Item already saved; the source version then moved on with it.
    if ((version?.version_id ?? null) !== request.expectedVersionId && !existing.every(Boolean)) {
      throw new Error('formula_cloze_source_changed');
    }
    const pending = request.regions.filter((_, index) => !existing[index]);
    const dueDates = pending.length
      ? allocateNewItemReviewDueDates({ batchSize: pending.length, nodes: await loadNewItemReviewLoadWithDb(tx, now), now }) : [];
    const host = await iosCompanionHostName(tx);
    let pendingIndex = 0;
    for (const [index, region] of request.regions.entries()) {
      const saved = existing[index];
      if (saved) {
        if (!sameFormulaCloze(saved, formulaClozeNode(request, region, source, saved.review, now))) throw new Error('formula_cloze_request_mismatch');
        continue;
      }
      const review = createInitialNewItemReviewProfile(dueDates[pendingIndex++]!);
      const node = formulaClozeNode(request, region, source, review, now);
      assertNodeTextForSave(node);
      const nodeVersion = await toWorkspaceNativeNodeVersion(node, host);
      const applied = await applyLocalNodeVersionsWithDbPort(tx, [nodeVersion], 'local_mutation');
      if (!applied.appliedIds.includes(node.id)) throw new Error('formula_cloze_not_saved');
      await saveIosReviewWithDb(tx, { node_id: node.id, review_json: JSON.stringify(review) });
      await recordCompanionAnnotationHistory(tx, { documentId: parent.id, before: null, after: { ...node, currentVersionId: nodeVersion.version_id } });
    }
    assertScope();
    return request.regions.map(region => region.nodeId);
  }), { kind: 'business' }), (nodeIds): WorkspaceRefreshScope => ({
    kind: 'nodes', nodeIds: [...nodeIds, request.parentNodeId], structure: true, metadata: true, reviewNodeIds: nodeIds
  }));
}

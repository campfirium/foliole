import { useLayoutEffect, useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { createFormulaClozePresentationRegion, type FormulaClozePresentationRegion } from '../features/formula-cloze/model/formulaCloze';
import {
  getFormulaClozeAnswerEditorNodeId,
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../features/formula-cloze/model/formulaClozePresentation';
import { prepareWorkspaceNodeChildrenIndex } from '../features/nodes/model/workspaceNodeChildrenIndex';
import { isCanonicalTrashedNodeId } from '../shared/workspaceCanonicalSelectors';

function listChildRegions(snapshot: WorkspaceSnapshot, nodeId: string) {
  const children = prepareWorkspaceNodeChildrenIndex(snapshot.nodesById).children.get(nodeId) ?? [];
  const regions: FormulaClozePresentationRegion[] = [];
  for (const { key } of children) {
    if (isCanonicalTrashedNodeId(snapshot, key)) continue;
    const region = createFormulaClozePresentationRegion(snapshot.nodesById[key]?.anchorLink);
    if (region) regions.push(region);
  }
  return regions;
}

/**
 * Masks a formula cloze Item's region in its prompt and outlines it in the answer, and outlines a source topic's
 * existing formula clozes, as desktop does. Mobile creates regions in its own sheet, so formulas never take drags here.
 */
export function useCompanionFormulaClozePresentation(snapshot: WorkspaceSnapshot | null, nodeId: string) {
  const node = snapshot?.nodesById[nodeId];
  const ownRegion = node?.anchorLink ? createFormulaClozePresentationRegion(node.anchorLink) : null;
  const hasOwnRegion = ownRegion !== null;
  const childRegions = useMemo(() => snapshot && !hasOwnRegion
    ? listChildRegions(snapshot, nodeId)
    : [], [snapshot, nodeId, hasOwnRegion]);
  // Identical re-registrations stay silent, so registering on every render does not rebuild formula widgets.
  useLayoutEffect(() => {
    const answerId = getFormulaClozeAnswerEditorNodeId(nodeId)!;
    if (ownRegion) {
      registerFormulaClozeEditorPresentation(nodeId, { canCreate: false, hiddenRegionIds: [ownRegion.id], outlinedRegionIds: [], matchByFormulaText: true, regions: [ownRegion] });
      registerFormulaClozeEditorPresentation(answerId, { canCreate: false, hiddenRegionIds: [], outlinedRegionIds: [ownRegion.id], matchByFormulaText: true, regions: [ownRegion] });
      return;
    }
    registerFormulaClozeEditorPresentation(nodeId, { canCreate: false, hiddenRegionIds: [], outlinedRegionIds: childRegions.map(region => region.id), regions: childRegions });
    registerFormulaClozeEditorPresentation(answerId, { canCreate: false, hiddenRegionIds: [], outlinedRegionIds: [], regions: [] });
  });
  useLayoutEffect(() => () => {
    unregisterFormulaClozeEditorPresentation(nodeId);
    unregisterFormulaClozeEditorPresentation(getFormulaClozeAnswerEditorNodeId(nodeId)!);
  }, [nodeId]);
  return childRegions;
}

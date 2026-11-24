import { useLayoutEffect, useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { createFormulaClozePresentationRegion, deriveFormulaClozeRegionsFromChildren } from '../features/formula-cloze/model/formulaCloze';
import {
  getFormulaClozeAnswerEditorNodeId,
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../features/formula-cloze/model/formulaClozePresentation';

/**
 * Masks a formula cloze Item's region in its prompt and outlines it in the answer, and outlines a source topic's
 * existing formula clozes, as desktop does. Mobile creates regions in its own sheet, so formulas never take drags here.
 */
export function useCompanionFormulaClozePresentation(snapshot: WorkspaceSnapshot | null, nodeId: string) {
  const node = snapshot?.nodesById[nodeId];
  const ownRegion = node?.anchorLink ? createFormulaClozePresentationRegion(node.anchorLink) : null;
  const hasOwnRegion = ownRegion !== null;
  const childRegions = useMemo(() => snapshot && !hasOwnRegion
    ? deriveFormulaClozeRegionsFromChildren({ nodeId, nodesById: snapshot.nodesById, trashedNodeIds: snapshot.trashedNodeIds })
    : [], [snapshot, nodeId, hasOwnRegion]);
  // Identical re-registrations stay silent, so registering on every render does not rebuild formula widgets.
  useLayoutEffect(() => {
    const answerId = getFormulaClozeAnswerEditorNodeId(nodeId)!;
    if (ownRegion) {
      registerFormulaClozeEditorPresentation(nodeId, { canCreate: false, hiddenRegionIds: [ownRegion.id], outlinedRegionIds: [], regions: [ownRegion] });
      registerFormulaClozeEditorPresentation(answerId, { canCreate: false, hiddenRegionIds: [], outlinedRegionIds: [ownRegion.id], regions: [ownRegion] });
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

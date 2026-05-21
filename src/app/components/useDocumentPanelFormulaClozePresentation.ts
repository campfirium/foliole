import { useLayoutEffect } from 'react';

import {
  createFormulaClozePresentationRegion,
  deriveFormulaClozeRegionsFromChildren,
  getFormulaClozeLocator,
  isFormulaClozeNode
} from '../../features/formula-cloze/model/formulaCloze';
import {
  getFormulaClozeAnswerEditorNodeId,
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../../features/formula-cloze/model/formulaClozePresentation';
import type { Node } from '../../features/nodes/model/nodeTypes';

function registerParentFormulaPresentation(editorNodeId: string, activeNode: Node, nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  const regions = deriveFormulaClozeRegionsFromChildren({ nodeId: activeNode.id, nodesById, trashedNodeIds });
  registerFormulaClozeEditorPresentation(editorNodeId, {
    canCreate: true,
    hiddenRegionIds: [],
    outlinedRegionIds: regions.map((region) => region.id),
    regions
  });
  return () => unregisterFormulaClozeEditorPresentation(editorNodeId);
}

function registerFocusedFormulaPresentation(editorNodeId: string, activeNode: Node, showAnswerNodeId: string | null) {
  if (!activeNode.anchorLink) return undefined;
  const region = createFormulaClozePresentationRegion(activeNode.anchorLink);
  const locator = getFormulaClozeLocator(activeNode.anchorLink);
  if (!region || !locator) return undefined;
  registerFormulaClozeEditorPresentation(editorNodeId, {
    canCreate: false,
    hiddenRegionIds: [region.id],
    outlinedRegionIds: [],
    regions: [region]
  });
  if (showAnswerNodeId) {
    registerFormulaClozeEditorPresentation(showAnswerNodeId, {
      canCreate: false,
      hiddenRegionIds: [],
      outlinedRegionIds: [region.id],
      regions: [region]
    });
  }
  return () => {
    unregisterFormulaClozeEditorPresentation(editorNodeId);
    if (showAnswerNodeId) unregisterFormulaClozeEditorPresentation(showAnswerNodeId);
  };
}

export function useDocumentPanelFormulaClozePresentation(args: {
  activeNode: Node | undefined;
  editorNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  useLayoutEffect(() => {
    if (!args.editorNodeId || !args.activeNode) return undefined;
    if (isFormulaClozeNode(args.activeNode)) {
      return registerFocusedFormulaPresentation(
        args.editorNodeId,
        args.activeNode,
        getFormulaClozeAnswerEditorNodeId(args.editorNodeId)
      );
    }
    return registerParentFormulaPresentation(args.editorNodeId, args.activeNode, args.nodesById, args.trashedNodeIds);
  }, [args.activeNode, args.editorNodeId, args.nodesById, args.trashedNodeIds]);
}

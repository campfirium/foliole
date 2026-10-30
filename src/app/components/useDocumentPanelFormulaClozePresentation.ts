import { useLayoutEffect, useRef } from 'react';

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
import { canCreateSelectionAnnotation } from '../../shared/selectionAnnotationEligibility';

import { useDocumentPanelMarkerChildren } from './useDocumentPanelMarkerChildren';
import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

function registerParentFormulaPresentation(editorNodeId: string, activeNode: Node, nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  const regions = deriveFormulaClozeRegionsFromChildren({ nodeId: activeNode.id, nodesById, trashedNodeIds });
  registerFormulaClozeEditorPresentation(editorNodeId, {
    canCreate: canCreateSelectionAnnotation(activeNode),
    hiddenRegionIds: [],
    outlinedRegionIds: regions.map((region) => region.id),
    regions
  });
  return [editorNodeId];
}

function registerFocusedFormulaPresentation(editorNodeId: string, activeNode: Node, showAnswerNodeId: string | null) {
  if (!activeNode.anchorLink) return [];
  const region = createFormulaClozePresentationRegion(activeNode.anchorLink);
  const locator = getFormulaClozeLocator(activeNode.anchorLink);
  if (!region || !locator) return [];
  registerFormulaClozeEditorPresentation(editorNodeId, {
    canCreate: false,
    hiddenRegionIds: [region.id],
    outlinedRegionIds: [],
    regions: [region]
  });
  if (!showAnswerNodeId) return [editorNodeId];
  registerFormulaClozeEditorPresentation(showAnswerNodeId, {
    canCreate: false,
    hiddenRegionIds: [],
    outlinedRegionIds: [region.id],
    regions: [region]
  });
  return [editorNodeId, showAnswerNodeId];
}

function registerFormulaPresentation(args: {
  activeNode: Node | undefined;
  editorNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  if (!args.editorNodeId || !args.activeNode) return [];
  if (isFormulaClozeNode(args.activeNode)) {
    return registerFocusedFormulaPresentation(
      args.editorNodeId,
      args.activeNode,
      getFormulaClozeAnswerEditorNodeId(args.editorNodeId)
    );
  }
  return registerParentFormulaPresentation(args.editorNodeId, args.activeNode, args.nodesById, args.trashedNodeIds);
}

// Registrations are replaced in place: unregistering before each update would leave a moment where
// rebuilt formula widgets read no presentation and an identical re-registration would not repaint them.
export function useDocumentPanelFormulaClozePresentation(args: {
  activeNode: Node | undefined;
  editorNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const markerChildren = useDocumentPanelMarkerChildren(args.activeNode?.id ?? null, args.nodesById);
  const registeredIdsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    measureWorkspaceDiagnostic('document-panel-formula-cloze-layout-effect', {
      activeNodeId: args.activeNode?.id,
      editorNodeId: args.editorNodeId,
      markerChildCount: Object.keys(markerChildren).length
    }, () => {
      const registeredIds = registerFormulaPresentation({ ...args, nodesById: markerChildren });
      for (const id of registeredIdsRef.current) {
        if (!registeredIds.includes(id)) unregisterFormulaClozeEditorPresentation(id);
      }
      registeredIdsRef.current = registeredIds;
    });
  }, [args.activeNode, args.editorNodeId, markerChildren, args.trashedNodeIds]);
  useLayoutEffect(() => () => {
    registeredIdsRef.current.forEach(unregisterFormulaClozeEditorPresentation);
    registeredIdsRef.current = [];
  }, []);
}

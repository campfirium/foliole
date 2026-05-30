import { useLayoutEffect } from 'react';

import {
  deriveImageClozeRegionsFromChildren,
  getImageClozeLocator,
  isImageClozeNode,
  listImageClozePresentationRegions,
  mergeImageClozeRegionGroups
} from '../../features/image-cloze/model/imageCloze';
import {
  getImageClozeAnswerEditorNodeId,
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../features/image-cloze/model/imageClozePresentation';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

function registerParentImageClozePresentation(promptNodeId: string, parentRegions: ReturnType<typeof listImageClozePresentationRegions>) {
  if (parentRegions.length === 0) {
    return undefined;
  }
  registerImageClozeEditorPresentation(promptNodeId, {
    canCreate: true,
    focusRegionId: null,
    hiddenRegionIds: [],
    outlinedRegionIds: parentRegions.map((region) => region.id),
    regions: parentRegions
  });
  return () => {
    unregisterImageClozeEditorPresentation(promptNodeId);
  };
}

function registerFocusedImageClozePresentation(
  promptNodeId: string,
  answerNodeId: string | null,
  activeNode: Node,
  locator: NonNullable<ReturnType<typeof getImageClozeLocator>>
) {
  const currentRegions = listImageClozePresentationRegions(activeNode.imageRegions).filter(
    (region) => region.attachmentId === locator.attachmentId
  );
  const fallbackRegionId = activeNode.anchorLink?.id ?? 'current';
  const resolvedRegions = currentRegions.length > 0 ? currentRegions : [{ ...locator, id: fallbackRegionId }];
  const currentRegionIds = resolvedRegions.map((region) => region.id);
  registerImageClozeEditorPresentation(promptNodeId, {
    canCreate: false,
    focusRegionId: null,
    hiddenRegionIds: currentRegionIds,
    outlinedRegionIds: [],
    regions: resolvedRegions
  });
  if (answerNodeId) {
    registerImageClozeEditorPresentation(answerNodeId, {
      canCreate: false,
      focusRegionId: currentRegionIds[0] ?? null,
      hiddenRegionIds: [],
      outlinedRegionIds: currentRegionIds,
      regions: resolvedRegions
    });
  }
  return () => {
    unregisterImageClozeEditorPresentation(promptNodeId);
    if (answerNodeId) {
      unregisterImageClozeEditorPresentation(answerNodeId);
    }
  };
}

function resolveParentPresentationImageRegions(activeNode: Node) {
  if (activeNode.anchorLink?.kind === 'highlight') {
    return null;
  }
  return activeNode.imageRegions;
}

export function useDocumentPanelImageClozePresentation(args: {
  activeNode: Node | undefined;
  editorNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  useLayoutEffect(() => {
    return measureWorkspaceDiagnostic('document-panel-image-cloze-layout-effect', {
      activeNodeId: args.activeNode?.id,
      editorNodeId: args.editorNodeId,
      nodeCount: Object.keys(args.nodesById).length
    }, () => {
      if (!args.editorNodeId || !args.activeNode) {
        return undefined;
      }
      const promptNodeId = args.editorNodeId;
      const answerNodeId = getImageClozeAnswerEditorNodeId(args.editorNodeId);
      const parentRegions = listImageClozePresentationRegions(
        mergeImageClozeRegionGroups(
          resolveParentPresentationImageRegions(args.activeNode),
          deriveImageClozeRegionsFromChildren({
            nodeId: args.activeNode.id,
            nodesById: args.nodesById,
            trashedNodeIds: args.trashedNodeIds
          })
        )
      );

      if (!isImageClozeNode(args.activeNode)) {
        return registerParentImageClozePresentation(promptNodeId, parentRegions);
      }

      const locator = getImageClozeLocator(args.activeNode.anchorLink);
      if (!locator) {
        return undefined;
      }
      return registerFocusedImageClozePresentation(promptNodeId, answerNodeId, args.activeNode, locator);
    });
  }, [args.activeNode, args.editorNodeId, args.nodesById, args.trashedNodeIds]);
}

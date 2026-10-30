import { useLayoutEffect, useMemo } from 'react';

import {
  deriveImageClozeRegionsFromChildren,
  getImageClozeLocator,
  listImageClozePresentationRegions,
  mergeImageClozeRegionGroups
} from '../../features/image-cloze/model/imageCloze';
import {
  getImageClozeAnswerEditorNodeId,
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../features/image-cloze/model/imageClozePresentation';
import { isTextAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import { canCreateSelectionAnnotation } from '../../shared/selectionAnnotationEligibility';

import { useDocumentPanelImageInputs } from './useDocumentPanelImageInputs';
import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

type ImagePresentationSource = Pick<Node, 'id' | 'content' | 'anchorLink' | 'imageRegions'>;

function registerFocusedImageClozePresentation(
  promptNodeId: string,
  answerNodeId: string | null,
  activeNode: ImagePresentationSource,
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

function resolveParentPresentationImageRegions(activeNode: ImagePresentationSource) {
  if (activeNode.anchorLink?.kind === 'highlight') {
    return null;
  }
  return activeNode.imageRegions;
}

function listOccurrenceBoundImageExcerptRegions(args: {
  activeNode: ImagePresentationSource;
  nodesById: Record<string, Node>;
}) {
  return Object.values(args.nodesById).flatMap((node) => {
    const locator = node.anchorLink?.locator;
    if (
      node.parentNodeId !== args.activeNode.id ||
      node.anchorLink?.kind !== 'image-excerpt' ||
      !isTextAnchorLocator(locator) ||
      args.activeNode.content.slice(locator.from, locator.to) !== locator.originalText
    ) {
      return [];
    }
    return (node.imageRegions ?? []).flatMap((group) => {
      if (!locator.originalText.includes(`asset://${group.attachmentId}`)) return [];
      return group.regions.map((region) => ({
        ...region,
        attachmentId: group.attachmentId,
        imageRange: { from: locator.from, to: locator.to },
        openNodeId: node.id
      }));
    });
  });
}

export function useDocumentPanelImageClozePresentation(args: {
  activeNode: Node | undefined;
  editorNodeId: string | null;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}) {
  const { source, selectedNodesById } = useDocumentPanelImageInputs(
    args.editorNodeId ? args.activeNode : undefined, args.nodesById, args.trashedNodeIds
  );
  const { editorNodeId, onOpenNode } = args;
  const canCreate = canCreateSelectionAnnotation(args.activeNode);
  const parentRegions = useMemo(() => {
    if (!source || getImageClozeLocator(source.anchorLink)) return [];
    return [
      ...listImageClozePresentationRegions(
        mergeImageClozeRegionGroups(
          resolveParentPresentationImageRegions(source),
          deriveImageClozeRegionsFromChildren({ nodeId: source.id, nodesById: selectedNodesById })
        )
      ),
      ...listOccurrenceBoundImageExcerptRegions({ activeNode: source, nodesById: selectedNodesById })
    ];
  }, [source, selectedNodesById]);
  useLayoutEffect(() => {
    return measureWorkspaceDiagnostic('document-panel-image-cloze-layout-effect', {
      activeNodeId: source?.id,
      editorNodeId,
      imageNodeCount: Object.keys(selectedNodesById).length
    }, () => {
      if (!editorNodeId || !source) return undefined;
      const answerNodeId = getImageClozeAnswerEditorNodeId(editorNodeId);
      const locator = getImageClozeLocator(source.anchorLink);
      if (locator) {
        return registerFocusedImageClozePresentation(editorNodeId, answerNodeId, source, locator);
      }
      if (parentRegions.length === 0 && canCreate) return undefined;
      registerImageClozeEditorPresentation(editorNodeId, {
        canCreate,
        focusRegionId: null,
        hiddenRegionIds: [],
        onOpenNode,
        outlinedRegionIds: parentRegions.map((region) => region.id),
        regions: parentRegions
      });
      return () => unregisterImageClozeEditorPresentation(editorNodeId);
    });
  }, [source, editorNodeId, selectedNodesById, onOpenNode, parentRegions, canCreate]);
}

import { parseExcerptAnnotationContent } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import { isTextAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';

export function resolveExistingExcerptNode(
  node: Node,
  options: { canAdjustRange: boolean; originalText?: string }
) {
  const parsed = parseExcerptAnnotationContent({
    content: node.content,
    notePrefix: getHighlightAnnotationPrefix()
  });
  return {
    canAdjustRange: options.canAdjustRange,
    kind: node.anchorLink?.kind ?? 'highlight',
    nodeId: node.id,
    note: parsed.note,
    originalText: options.originalText ?? parsed.body
  };
}

export function getWholeImageExcerptTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const direct = target.closest<HTMLElement>('.cm-md-image-cloze-region[data-region-scope="full-image"]');
  if (direct) return direct;
  const surface = target.closest<HTMLElement>('.cm-md-image-surface[data-md-image-highlighted="true"]');
  const matches = surface?.querySelectorAll<HTMLElement>('.cm-md-image-cloze-region[data-region-scope="full-image"]');
  return matches?.length === 1 ? matches[0] ?? null : null;
}

export function resolveWholeImageExistingExcerpt(input: {
  activeNodeId: string;
  nodesById: Record<string, Node>;
  target: HTMLElement;
  trashedNodeIds: string[];
}) {
  const regionId = input.target.dataset.regionId;
  if (!regionId) return null;
  const matches = Object.values(input.nodesById).filter((node) =>
    node.parentNodeId === input.activeNodeId &&
    !input.trashedNodeIds.includes(node.id) &&
    node.anchorLink?.kind === 'highlight' &&
    isTextAnchorLocator(node.anchorLink.locator) &&
    node.imageRegions?.some((group) => group.regions.some((region) =>
      region.id === regionId && region.x <= 0.001 && region.y <= 0.001 &&
      region.width >= 0.999 && region.height >= 0.999
    ))
  );
  return matches.length === 1 ? resolveExistingExcerptNode(matches[0]!, { canAdjustRange: false }) : null;
}

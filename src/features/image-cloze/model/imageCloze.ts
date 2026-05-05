import { collectMarkdownImageReferences } from '../../../../lib/core/import/markdownImageReferences';
import {
  hasNodeContent,
  type ImageAnchorLocator,
  type Node,
  type NodeAnchorLink,
  type NodeImageRegionGroup
} from '../../nodes/model/nodeTypes';

export type ImageClozeLocator = ImageAnchorLocator;

export interface ImageClozeSourcePayload {
  promptContent: string;
  revealContent: string;
}

export interface ImageClozeDraftRegion extends ImageClozeLocator {
  answer: string;
  id: string;
}

export function listImageClozePresentationRegions(imageRegions: NodeImageRegionGroup[] | null | undefined) {
  if (!imageRegions) {
    return [];
  }
  return imageRegions.flatMap((group) =>
    group.regions.map((region) => ({
      ...region,
      attachmentId: group.attachmentId
    }))
  );
}

export function appendImageClozeRegions(
  currentImageRegions: NodeImageRegionGroup[] | null | undefined,
  attachmentId: string,
  regions: ImageClozeDraftRegion[]
): NodeImageRegionGroup[] {
  const existingGroups = currentImageRegions ? [...currentImageRegions] : [];
  const existingGroup = existingGroups.find((group) => group.attachmentId === attachmentId);
  const nextRegions = regions.map(({ answer: _answer, attachmentId: _attachmentId, ...region }) => region);

  if (!existingGroup) {
    return [...existingGroups, { attachmentId, regions: nextRegions }];
  }

  const regionIds = new Set(existingGroup.regions.map((region) => region.id));
  existingGroup.regions = [
    ...existingGroup.regions,
    ...nextRegions.filter((region) => {
      if (regionIds.has(region.id)) {
        return false;
      }
      regionIds.add(region.id);
      return true;
    })
  ];
  return existingGroups;
}

function isFiniteRatio(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isImageClozeLocator(value: unknown): value is ImageClozeLocator {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const width = candidate.width;
  const height = candidate.height;
  return (
    typeof candidate.attachmentId === 'string' &&
    candidate.attachmentId.trim().length > 0 &&
    isFiniteRatio(candidate.x) &&
    isFiniteRatio(candidate.y) &&
    typeof width === 'number' &&
    isFiniteRatio(width) &&
    typeof height === 'number' &&
    isFiniteRatio(height) &&
    width > 0 &&
    height > 0
  );
}

export function isImageClozeAnchorLink(anchorLink: NodeAnchorLink | null | undefined) {
  return anchorLink?.kind === 'cloze' && isImageClozeLocator(anchorLink.locator);
}

export function getImageClozeLocator(anchorLink: NodeAnchorLink | null | undefined): ImageClozeLocator | null {
  if (!anchorLink || anchorLink.kind !== 'cloze' || !isImageClozeLocator(anchorLink.locator)) {
    return null;
  }
  return anchorLink.locator;
}

export function isImageClozeNode(node: Node | null | undefined) {
  return Boolean(node && isImageClozeAnchorLink(node.anchorLink));
}

export function isLegacyImageClozeNode(node: Node | null | undefined) {
  return Boolean(node && isImageClozeNode(node) && !hasNodeContent(node));
}

export function deriveImageClozeRegionsFromChildren(args: {
  nodeId: string;
  nodesById: Record<string, Node>;
  trashedNodeIds?: string[];
}) {
  const groupsByAttachmentId = new Map<string, NodeImageRegionGroup>();
  const trashedNodeIdSet = new Set(args.trashedNodeIds ?? []);

  for (const node of Object.values(args.nodesById)) {
    if (node.parentNodeId !== args.nodeId || trashedNodeIdSet.has(node.id)) {
      continue;
    }
    const locator = getImageClozeLocator(node.anchorLink);
    if (!locator) {
      continue;
    }
    const group = groupsByAttachmentId.get(locator.attachmentId) ?? {
      attachmentId: locator.attachmentId,
      regions: []
    };
    if (!groupsByAttachmentId.has(locator.attachmentId)) {
      groupsByAttachmentId.set(locator.attachmentId, group);
    }
    if (group.regions.some((region) => region.id === node.anchorLink?.id)) {
      continue;
    }
    group.regions.push({
      id: node.anchorLink?.id ?? `legacy-${node.id}`,
      height: locator.height,
      width: locator.width,
      x: locator.x,
      y: locator.y
    });
  }

  return [...groupsByAttachmentId.values()];
}

function keepOnlyTargetImage(content: string, imageRange: { from: number; to: number }) {
  const matches = collectMarkdownImageReferences(content);
  if (matches.length === 0) {
    return content.trim();
  }

  let cursor = 0;
  let output = '';
  for (const match of matches) {
    output += content.slice(cursor, match.start);
    const absoluteFrom = match.start;
    const absoluteTo = match.end;
    if (absoluteFrom === imageRange.from && absoluteTo === imageRange.to) {
      output += content.slice(match.start, match.end);
    }
    cursor = match.end;
  }
  output += content.slice(cursor);
  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildImageClozeSourcePayload(
  content: string,
  imageRange: { from: number; to: number }
): ImageClozeSourcePayload | null {
  const revealContent = content.slice(imageRange.from, imageRange.to).trim();
  if (!revealContent) {
    return null;
  }

  const promptContent = keepOnlyTargetImage(content, imageRange);

  return {
    promptContent,
    revealContent
  };
}

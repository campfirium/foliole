import { collectMarkdownImageReferences } from '../../../../lib/core/import/markdownImageReferences';
import {
  hasNodeContent,
  type ImageAnchorLocator,
  type Node,
  type NodeAnchorLink,
  type NodeImageRegionGroup
} from '../../nodes/model/nodeTypes';

import { appendUniqueRegions, collectChildRegionIds, collectNodePresentedRegions } from './imageClozeRegionGroups';

export type ImageClozeLocator = ImageAnchorLocator;

export interface ImageClozeSourcePayload {
  promptContent: string;
  revealContent: string;
}

export interface ImageClozeDraftRegion extends ImageClozeLocator {
  answer: string;
  id: string;
}

function stripDraftRegion(region: ImageClozeDraftRegion) {
  const { answer, attachmentId: _attachmentId, ...nextRegion } = region;
  void answer;
  void _attachmentId;
  return nextRegion;
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
  const nextRegions = regions.map(stripDraftRegion);

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

export function removeImageClozeRegion(
  currentImageRegions: NodeImageRegionGroup[] | null | undefined,
  attachmentId: string,
  regionId: string
): NodeImageRegionGroup[] | null {
  if (!currentImageRegions) {
    return currentImageRegions ?? null;
  }

  const nextGroups = currentImageRegions
    .map((group) => {
      if (group.attachmentId !== attachmentId) {
        return group;
      }
      return {
        ...group,
        regions: group.regions.filter((region) => region.id !== regionId)
      };
    })
    .filter((group) => group.regions.length > 0);

  return nextGroups.length > 0 ? nextGroups : null;
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
  const visibleNodes = Object.values(args.nodesById).filter((node) => !trashedNodeIdSet.has(node.id));
  const childNodes = visibleNodes.filter((node) => node.parentNodeId === args.nodeId);

  for (const node of childNodes) {
    const directChildRegionsByAttachmentId = collectNodePresentedRegions(node);
    const directGrandchildRegionIdsByAttachmentId = collectChildRegionIds(visibleNodes, node.id);

    for (const [attachmentId, group] of directChildRegionsByAttachmentId.entries()) {
      const grandchildRegionIds = directGrandchildRegionIdsByAttachmentId.get(attachmentId) ?? new Set<string>();
      appendUniqueRegions(
        groupsByAttachmentId,
        attachmentId,
        group.regions.filter((region) => !grandchildRegionIds.has(region.id))
      );
    }
  }

  return [...groupsByAttachmentId.values()];
}

export function mergeImageClozeRegionGroups(
  ...groupsList: Array<NodeImageRegionGroup[] | null | undefined>
): NodeImageRegionGroup[] {
  const mergedByAttachmentId = new Map<string, NodeImageRegionGroup>();

  for (const groups of groupsList) {
    if (!groups) {
      continue;
    }
    for (const group of groups) {
      const existing = mergedByAttachmentId.get(group.attachmentId) ?? {
        attachmentId: group.attachmentId,
        regions: []
      };
      if (!mergedByAttachmentId.has(group.attachmentId)) {
        mergedByAttachmentId.set(group.attachmentId, existing);
      }
      const regionIds = new Set(existing.regions.map((region) => region.id));
      for (const region of group.regions) {
        if (regionIds.has(region.id)) {
          continue;
        }
        regionIds.add(region.id);
        existing.regions.push(region);
      }
    }
  }

  return [...mergedByAttachmentId.values()];
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

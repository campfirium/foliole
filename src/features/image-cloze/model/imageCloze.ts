import type { ImageAnchorLocator, Node, NodeAnchorLink } from '../../nodes/model/nodeTypes';

export type ImageClozeLocator = ImageAnchorLocator;

export interface ImageClozeDraftRegion extends ImageClozeLocator {
  answer: string;
  id: string;
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

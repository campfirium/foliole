import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../../../lib/core/nodes/virtualNodeFilter';

export interface NodeReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

export interface NodeReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface NodeAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    page: number;
    x: number;
    y: number;
  };
}

export type NodeSpecialKind = 'inbox' | 'virtual-root' | 'virtual';

export interface Node {
  id: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  specialKind?: NodeSpecialKind;
  title: string;
  isTitleManual?: boolean;
  hideTitleHeading?: boolean;
  hasContent?: boolean;
  hasReveal?: boolean;
  content: string;
  virtualFilter?: VirtualNodeFilter | null;
  anchorLink?: NodeAnchorLink | null;
  reveal: string | null;
  reading?: NodeReadingProfile | null;
  review: NodeReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}

export function hasNodeContent(node: Pick<Node, 'content' | 'hasContent'> | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasContent === 'boolean') {
    return node.hasContent;
  }
  return node.content.trim().length > 0;
}

export function hasNodeReveal(node: Pick<Node, 'reveal' | 'hasReveal'> | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasReveal === 'boolean') {
    return node.hasReveal;
  }
  return node.reveal !== null;
}

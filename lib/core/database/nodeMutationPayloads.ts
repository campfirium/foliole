import type { NodeKind } from '../nodes/nodeKind.js';
import type { VirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { NodeReadingPayload } from './nodeReadingPayload.js';

export interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    from?: number;
    height?: number;
    originalText?: string;
    page?: number;
    to?: number;
    width?: number;
    x: number;
    y: number;
  } | {
    ranges: Array<{
      from: number;
      originalText: string;
      to: number;
    }>;
  } | {
    from: number;
    originalText: string;
    to: number;
  };
}

export interface NodeImageRegionPayload {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface NodeImageRegionGroupPayload {
  attachmentId: string;
  regions: NodeImageRegionPayload[];
}

export interface UpsertNodeSnapshotInput {
  nodeId: string;
  deviceId?: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  enableShortTerm?: boolean | null;
  sequentialReadingEnabled?: boolean | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading?: boolean;
  content: string;
  openingText?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: NodeAnchorLinkPayload | null;
  imageRegions?: NodeImageRegionGroupPayload[] | null;
  reading?: NodeReadingPayload | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

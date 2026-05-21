import type { NodeKind } from '../core/nodes/nodeKind.js';
import type { VirtualNodeFilter } from '../core/nodes/virtualNodeFilter.js';
import type { UnifiedPushQueueRules } from '../core/review/unifiedPushQueueRules.js';

import type { NativeSchedulerCard } from './nativeContract.js';
import type { NativeWorkspaceReadingProfile } from './nativeReadingContract.js';
import type { NativeWorkspaceAnchorLink, NativeWorkspaceImageRegionGroup } from './nativeWorkspaceNodeContract.js';
import type { NodeViewStateWriteSource } from './persistedNodeViewState.js';

export interface NativeWorkspaceReviewProfile {
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

export interface NativeWorkspaceNodeSnapshot {
  id: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  enableShortTerm?: boolean | null;
  sequentialReadingEnabled?: boolean | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading?: boolean;
  hasContent?: boolean;
  hasReveal?: boolean;
  openingText?: string | null;
  content: string;
  currentVersionId?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: NativeWorkspaceAnchorLink | null;
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
  reading: NativeWorkspaceReadingProfile | null;
  review: NativeWorkspaceReviewProfile | null;
  createdAt: string;
  deletedAt?: string | null;
  updatedAt: string;
}

export interface NativeWorkspaceSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, NativeWorkspaceNodeSnapshot>;
  trashedNodeIds: string[];
}

export interface NativeWorkspaceNodeDocument {
  content: string;
  hideTitleHeading: boolean;
  kind: NodeKind;
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
  nodeId: string;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
}

export interface NativeWorkspaceBacklink {
  source_node_id: string;
  source_title: string;
  context: string;
  match_count: number;
}

export interface NativeWorkspaceSearchResult {
  excerpt: string;
  id: string;
  kind: 'external' | 'node' | 'pdf';
  externalMatch: {
    absolutePath: string;
    folderId: string;
    folderPath: string;
    query: string;
    relativePath: string;
  } | null;
  nodeMatch: {
    from: number;
    query: string;
    to: number;
  } | null;
  pdfMatch: {
    attachmentId: string;
    matchStart: number;
    page: number;
    pageTextLength: number;
    query: string;
  } | null;
  title: string;
  updatedAt: string;
}

export type {
  NativeExternalSearchAttachmentMode,
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from './nativeExternalSearchContract.js';
export type * from './nativeSyncContract.js';
export type { NativeWorkspaceReadingProfile } from './nativeReadingContract.js';
export type {
  NativeWorkspaceAnchorLink,
  NativeWorkspaceImageRegion,
  NativeWorkspaceImageRegionGroup
} from './nativeWorkspaceNodeContract.js';

export interface NativeImportLocalImageAttachmentArgs {
  nodeId: string;
  sourcePath: string;
}

export interface NativeImportClipboardImageAttachmentArgs {
  bytesBase64: string;
  mimeType: string;
  nodeId: string;
  originalName?: string;
}

export interface NativeImportRemoteImageAttachmentArgs {
  nodeId: string;
  sourceUrl: string;
}

export type NativeImportLocalImageAttachmentErrorCode =
  | 'node_not_found'
  | 'download_failed'
  | 'source_not_found'
  | 'source_read_failed'
  | 'storage_write_failed'
  | 'unsupported_format';

export type NativeImportLocalImageAttachmentResult =
  | {
      status: 'imported';
      attachment_id: string;
      attachment_record: 'created' | 'reused';
      created_at: string;
      hash: string;
      mime_type: string;
      original_name: string;
      size_bytes: number;
      stored_file: 'created' | 'reused';
    }
  | {
      status: 'error';
      error_code: NativeImportLocalImageAttachmentErrorCode;
      message: string;
      source_path: string;
    };

export interface NativeReviewSchedulerSettings {
  algorithm: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  enableShortTerm: boolean;
  pushQueue: UnifiedPushQueueRules;
  updatedAt: string;
}

export interface NativeNodeSnapshotArgs {
  nodeId: string;
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
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: NativeWorkspaceAnchorLink | null;
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
  reading?: NativeWorkspaceReadingProfile | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NativeNodeAnchorLocatorUpdateArgs {
  nodeId: string;
  anchorLink: NativeWorkspaceAnchorLink;
  updatedAt: string;
}

export interface NativeReadingProgressNodeViewState {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

export interface NativeReadingProgressSnapshot {
  activeNodeId: string | null;
  nodeViewStateById: Record<
    string,
    { scrollTop: number; selectionFrom: number | null; selectionTo: number | null; updatedAt: string }
  >;
}

export interface NativeSaveReadingProgressArgs {
  activeNodeId: string | null;
  nodeViewStates: NativeReadingProgressNodeViewState[];
  source?: NodeViewStateWriteSource;
  updatedAt: string;
}

export interface NativeApplyReviewGradeArgs {
  nodeId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  cardBefore: NativeSchedulerCard;
  cardAfter: NativeSchedulerCard;
}

export interface NativeMergeReadwiseTopicHighlightsResult {
  merged_highlight_count: number;
  node_id: string;
  status: 'error' | 'merged' | 'noop';
}

export interface NativeRelearnNodeArgs {
  nodeId: string;
}

export interface NativeResetImportDataResult {
  clearedImportRunCount: number;
  clearedImportSourceCount: number;
  clearedKeepImportItemCount: number;
  deletedNodeCount: number;
  deletedRootNodeCount: number;
}

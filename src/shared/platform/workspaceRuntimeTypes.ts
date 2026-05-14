import type { NodeKind } from '../../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type {
  NativeApplyReviewGradeArgs,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeRelearnNodeArgs,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceSnapshot
} from '../../../lib/platform/nativeContract';

export interface WorkspaceRuntimeNode {
  anchorLink?: NativeNodeSnapshotArgs['anchorLink'];
  content: string;
  createdAt: string;
  desiredRetention?: number | null;
  hideTitleHeading?: boolean;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  id: string;
  imageRegions?: NativeNodeSnapshotArgs['imageRegions'];
  isTitleManual?: boolean;
  kind: NodeKind;
  parentNodeId: string | null;
  priority?: number | null;
  reading?: NativeNodeSnapshotArgs['reading'];
  reveal: string | null;
  title: string;
  updatedAt: string;
  virtualFilter?: VirtualNodeFilter | null;
}

export interface WorkspaceRuntimeNodeDocument {
  content: string;
  hideTitleHeading: boolean;
  imageRegions?: NativeNodeSnapshotArgs['imageRegions'];
  kind: NodeKind;
  reveal: string | null;
  virtualFilter?: VirtualNodeFilter | null;
}

export type WorkspaceRuntimeNodeSnapshot = NativeNodeSnapshotArgs;
export type WorkspaceRuntimeSnapshot = NativeWorkspaceSnapshot;
export type WorkspaceReadingProgressSnapshot = NativeReadingProgressSnapshot;
export type WorkspaceReadingProgressSavePayload = NativeSaveReadingProgressArgs;
export type WorkspaceReviewGradeSyncPayload = NativeApplyReviewGradeArgs;
export type WorkspaceRelearnNodePayload = NativeRelearnNodeArgs;

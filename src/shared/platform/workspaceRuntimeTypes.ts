import type { NodeKind } from '../../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type {
  NativeApplyReviewGradeArgs,
  NativeDeleteNodesPermanentlyResult,
  NativeMoveNodesArgs,
  NativeMoveNodesResult,
  NativeNodeMutationPatchResult,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeRelearnNodeArgs,
  NativeRestoreNodesResult,
  NativeSaveReadingProgressArgs,
  NativeSoftDeleteNodesResult,
  NativeManualVirtualCollection,
  NativeWorkspaceSnapshot
} from '../../../lib/platform/nativeContract';

export interface WorkspaceRuntimeNode {
  anchorLink?: NativeNodeSnapshotArgs['anchorLink'];
  content: string;
  createdAt: string;
  desiredRetention?: number | null;
  enableShortTerm?: boolean | null;
  sequentialReadingEnabled?: boolean | null;
  shelvedAt?: string | null;
  manualChildOrder?: string[] | null;
  collections?: string[];
  hideTitleHeading?: boolean;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  id: string;
  imageRegions?: NativeNodeSnapshotArgs['imageRegions'];
  isTitleManual?: boolean;
  kind: NodeKind;
  parentNodeId: string | null;
  priority?: number | null;
  reading?: NativeNodeSnapshotArgs['reading'];
  review?: NativeNodeSnapshotArgs['review'];
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
  updatedAt?: string;
  virtualFilter?: VirtualNodeFilter | null;
}

export type WorkspaceRuntimeNodeSnapshot = NativeNodeSnapshotArgs;
export type WorkspaceNodeMutationPatchResult = NativeNodeMutationPatchResult;
export type WorkspaceManualVirtualCollection = NativeManualVirtualCollection;
export type WorkspaceRuntimeSnapshot = NativeWorkspaceSnapshot;
export type WorkspaceMoveNodesPayload = NativeMoveNodesArgs;
export type WorkspaceMoveNodesResult = NativeMoveNodesResult;
export type WorkspaceReadingProgressSnapshot = NativeReadingProgressSnapshot;
export type WorkspaceRestoreNodesResult = NativeRestoreNodesResult;
export type WorkspaceSoftDeleteNodesResult = NativeSoftDeleteNodesResult;
export type WorkspaceDeleteNodesPermanentlyResult = NativeDeleteNodesPermanentlyResult;
export type WorkspaceReadingProgressSavePayload = NativeSaveReadingProgressArgs;
export type WorkspaceReviewGradeSyncPayload = NativeApplyReviewGradeArgs;
export type WorkspaceRelearnNodePayload = NativeRelearnNodeArgs;

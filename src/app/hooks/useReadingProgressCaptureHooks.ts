import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ReadingPositionSyncState } from './useAppRuntime';
import {
  useDebouncedReadingProgressPersistence,
  useImmediateReadingProgressCapture
} from './useReadingProgressSyncEffects';
import type { PendingNodeViewStateMap, ReadingProgressCaptureMode } from './useReadingProgressSyncSupport';

export function useReadingProgressCaptureHooks(args: {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushReadingProgress: (
    activeNodeIdOverride?: string | null,
    captureNodeIdOverride?: string | null,
    captureMode?: ReadingProgressCaptureMode
  ) => void;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
}) {
  useImmediateReadingProgressCapture(args);
  useDebouncedReadingProgressPersistence({
    activeNodeId: args.activeNodeId,
    editorRef: args.editorRef,
    flushReadingProgress: () => args.flushReadingProgress(undefined, undefined, 'user-scroll'),
    isViewingTrashNode: args.isViewingTrashNode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    ...definedProps({ getReadingPositionSyncState: args.getReadingPositionSyncState })
  });
}

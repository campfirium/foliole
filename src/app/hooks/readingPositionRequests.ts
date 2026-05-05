import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import type { ReadingPositionSyncState } from './useAppRuntime';

interface ReadingPositionRuntimeLike {
  bumpReadingPositionRequest: () => void;
  readingPositionRef: {
    current: {
      nodeId: string | null;
      selection: EditorSelection | null;
    };
  };
  readingPositionSyncRef: {
    current: {
      nodeId: string | null;
      state: ReadingPositionSyncState | null;
    };
  };
}

export function requestReadingPositionApply(args: {
  nodeId: string | null;
  reason: string;
  runtime: ReadingPositionRuntimeLike;
  selection: EditorSelection;
  targetViewportRatio?: number;
}) {
  args.runtime.readingPositionRef.current = {
    nodeId: args.nodeId,
    selection: args.selection
  };
  args.runtime.readingPositionSyncRef.current = {
    nodeId: args.nodeId,
    state: {
      reason: args.reason,
      startedAt: Date.now(),
      targetSelection: args.selection,
      targetViewportRatio: args.targetViewportRatio
    }
  };
  args.runtime.bumpReadingPositionRequest();
}

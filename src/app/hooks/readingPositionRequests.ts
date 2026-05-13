import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type { ReadingPositionRestoreCommand } from '../../features/editor/model/editorRestoreCommand';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';

import type { ReadingPositionSyncState } from './useAppRuntime';

interface ReadingPositionRuntimeLike {
  bumpReadingPositionRequest: () => void;
  readingPositionRef: {
    current: {
      nodeId: string | null;
      selection: EditorSelection | null;
    };
  };
  readingPositionRestoreCommandRef: {
    current: {
      command: ReadingPositionRestoreCommand | null;
      nodeId: string | null;
    };
  };
  readingPositionRestoreCommandSeqRef: {
    current: number;
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
  selection: EditorSelection | null;
  targetViewportMode?: EditorViewportMode;
  targetViewportRatio?: number;
}) {
  const command = createReadingPositionRestoreCommand(args);
  pushDebugTrace('runtime.reading-position.requested', {
    commandId: command.commandId,
    nodeId: args.nodeId,
    reason: args.reason,
    selection: args.selection,
    targetViewportMode: args.targetViewportMode ?? null,
    targetViewportRatio: args.targetViewportRatio ?? null
  });
  args.runtime.readingPositionRef.current = {
    nodeId: args.nodeId,
    selection: args.selection
  };
  args.runtime.readingPositionRestoreCommandRef.current = {
    nodeId: args.nodeId,
    command
  };
  args.runtime.readingPositionSyncRef.current = {
    nodeId: args.nodeId,
    state: {
      commandId: command.commandId,
      reason: args.reason,
      startedAt: command.startedAt,
      targetSelection: args.selection,
      targetViewportMode: args.targetViewportMode,
      targetViewportRatio: args.targetViewportRatio
    }
  };
  args.runtime.bumpReadingPositionRequest();
}

function createReadingPositionRestoreCommand(args: {
  nodeId: string | null;
  reason: string;
  runtime: ReadingPositionRuntimeLike;
  selection: EditorSelection | null;
  targetViewportMode?: EditorViewportMode;
  targetViewportRatio?: number;
}): ReadingPositionRestoreCommand {
  args.runtime.readingPositionRestoreCommandSeqRef.current += 1;
  return {
    commandId: `reading-position-${args.runtime.readingPositionRestoreCommandSeqRef.current}`,
    nodeId: args.nodeId,
    reason: args.reason,
    selection: args.selection,
    startedAt: Date.now(),
    targetViewportMode: args.targetViewportMode,
    targetViewportRatio: args.targetViewportRatio
  };
}

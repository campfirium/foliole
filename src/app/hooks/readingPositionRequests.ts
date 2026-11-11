import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type {
  EditorRestoreSelectionMode,
  ReadingPositionRestoreCommand
} from '../../features/editor/model/editorRestoreCommand';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import { definedProps } from '../../shared/lib/definedProps';

import type { ReadingPositionSyncState } from './useAppRuntime';

interface ReadingPositionRuntimeLike {
  bumpReadingPositionRequest: () => void;
  readingResumeMovedNodeIdRef?: { current: string | null };
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

const USER_READING_JUMPS = new Set(['anchor-navigation', 'workspace-search-result', 'reveal-anchor', 'reveal-selection', 'reveal-position']);

export function requestReadingPositionApply(args: {
  nodeId: string | null;
  reason: string;
  runtime: ReadingPositionRuntimeLike;
  scrollTop?: number;
  selection: EditorSelection | null;
  selectionMode?: EditorRestoreSelectionMode;
  targetViewportMode?: EditorViewportMode;
  targetViewportRatio?: number;
}) {
  const command = createReadingPositionRestoreCommand(args);
  if (args.selection && USER_READING_JUMPS.has(args.reason) && args.runtime.readingResumeMovedNodeIdRef) {
    args.runtime.readingResumeMovedNodeIdRef.current = args.nodeId;
  }
  pushDebugTrace('runtime.reading-position.requested', {
    commandId: command.commandId,
    nodeId: args.nodeId,
    reason: args.reason,
    scrollTop: args.scrollTop ?? null,
    selection: args.selection,
    selectionMode: args.selectionMode ?? null,
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
      ...definedProps({
        targetScrollTop: args.scrollTop,
        targetViewportMode: args.targetViewportMode,
        targetViewportRatio: args.targetViewportRatio
      })
    }
  };
  args.runtime.bumpReadingPositionRequest();
}

function createReadingPositionRestoreCommand(args: {
  nodeId: string | null;
  reason: string;
  runtime: ReadingPositionRuntimeLike;
  scrollTop?: number;
  selection: EditorSelection | null;
  selectionMode?: EditorRestoreSelectionMode;
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
    ...definedProps({
      scrollTop: args.scrollTop,
      selectionMode: args.selectionMode,
      targetViewportMode: args.targetViewportMode,
      targetViewportRatio: args.targetViewportRatio
    })
  };
}

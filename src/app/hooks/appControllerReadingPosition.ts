import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { requestReadingPositionApply } from './readingPositionRequests';

function isSameSelection(left: EditorSelection, right: EditorSelection) {
  return left.from === right.from && left.to === right.to;
}

function getActiveReadingSelection(args: BuildControllerLayoutPropsArgs) {
  const current = args.runtime.readingPositionRef.current;
  return current.nodeId === args.ws.activeNodeId ? current.selection : null;
}

function getActiveReadingRestoreCommand(args: BuildControllerLayoutPropsArgs) {
  const current = args.runtime.readingPositionRestoreCommandRef.current;
  return current.nodeId === args.ws.activeNodeId ? current.command : null;
}

function getActiveReadingSyncState(args: BuildControllerLayoutPropsArgs) {
  const current = args.runtime.readingPositionSyncRef.current;
  return current.nodeId === args.ws.activeNodeId ? current.state : null;
}

function getActiveReadingViewportRatio(args: BuildControllerLayoutPropsArgs) {
  return getActiveReadingRestoreCommand(args)?.targetViewportRatio ?? null;
}

function getActiveReadingViewportMode(args: BuildControllerLayoutPropsArgs) {
  return getActiveReadingRestoreCommand(args)?.targetViewportMode ?? null;
}

function setReadingSyncState(
  args: BuildControllerLayoutPropsArgs,
  nodeId: string | null,
  state: BuildControllerLayoutPropsArgs['runtime']['readingPositionSyncRef']['current']['state']
) {
  args.runtime.readingPositionSyncRef.current = { nodeId, state };
}

function completeReadingSyncState(args: {
  activeNodeId: string | null;
  currentState: BuildControllerLayoutPropsArgs['runtime']['readingPositionSyncRef']['current'];
  reason: string;
  runtime: BuildControllerLayoutPropsArgs['runtime'];
  selection?: EditorSelection;
  commandId?: string;
}) {
  if (args.currentState.nodeId !== args.activeNodeId || !args.currentState.state) {
    return;
  }
  const currentCommandId = args.currentState.state.commandId;
  if ((currentCommandId || args.commandId) && currentCommandId !== args.commandId) {
    return;
  }
  const targetSelection = args.currentState.state.targetSelection;
  if (args.selection && targetSelection && !isSameSelection(targetSelection, args.selection)) {
    return;
  }
  clearActiveRestoreCommand(args.runtime, args.activeNodeId, args.currentState.state.commandId);
  args.runtime.readingPositionSyncRef.current = {
    nodeId: args.activeNodeId,
    state: null
  };
  pushDebugTrace('runtime.reading-position.applying-complete', {
    activeNodeId: args.activeNodeId,
    commandId: args.currentState.state.commandId ?? null,
    reason: args.reason,
    selection: args.currentState.state.targetSelection
  });
}

function createReadingPositionAccessors(args: BuildControllerLayoutPropsArgs) {
  return {
    getReadingPositionRestoreCommand: () => getActiveReadingRestoreCommand(args),
    getReadingPositionSelection: () => getActiveReadingSelection(args),
    getReadingPositionSyncState: () => getActiveReadingSyncState(args),
    getReadingPositionTargetViewportMode: () => getActiveReadingViewportMode(args),
    getReadingPositionTargetViewportRatio: () => getActiveReadingViewportRatio(args)
  };
}

function setReadingPositionSelection(args: BuildControllerLayoutPropsArgs, selection: EditorSelection) {
  args.runtime.readingPositionRef.current = {
    nodeId: args.ws.activeNodeId,
    selection
  };
  pushDebugTrace('runtime.reading-position.updated', {
    activeNodeId: args.ws.activeNodeId,
    selection
  });
}

function clearActiveRestoreCommand(
  runtime: BuildControllerLayoutPropsArgs['runtime'],
  activeNodeId: string | null,
  commandId?: string
) {
  const current = runtime.readingPositionRestoreCommandRef.current;
  if (current.nodeId !== activeNodeId || !current.command) {
    return;
  }
  if (commandId && current.command.commandId !== commandId) {
    return;
  }
  runtime.readingPositionRestoreCommandRef.current = {
    nodeId: activeNodeId,
    command: null
  };
}

function beginReadingPositionApply(
  args: BuildControllerLayoutPropsArgs,
  nodeId: string | null,
  selection: EditorSelection,
  reason: string,
  commandId?: string
) {
  setReadingSyncState(args, nodeId, {
    commandId,
    reason,
    startedAt: Date.now(),
    targetSelection: selection
  });
}

function completeAnchorNavigationRestore(
  args: BuildControllerLayoutPropsArgs,
  nodeId: string,
  reason: string
) {
  const current = args.runtime.readingPositionSyncRef.current;
  if (current.nodeId !== nodeId || current.state?.reason !== 'anchor-navigation') {
    return;
  }
  clearActiveRestoreCommand(args.runtime, nodeId, current.state.commandId);
  args.runtime.readingPositionSyncRef.current = {
    nodeId,
    state: null
  };
  pushDebugTrace('runtime.anchor-navigation.applying-complete', {
    nodeId,
    reason,
    selection: current.state?.targetSelection ?? null
  });
}

function createReadingPositionMutations(args: BuildControllerLayoutPropsArgs) {
  return {
    beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => {
      requestReadingPositionApply({
        nodeId,
        reason: 'anchor-navigation',
        runtime: args.runtime,
        selection,
        targetViewportMode: 'center'
      });
      pushDebugTrace('runtime.anchor-navigation.applying-begin', {
        nodeId,
        selection
      });
    },
    beginApplyingReadingPosition: (selection: EditorSelection, reason: string, commandId?: string) => {
      beginReadingPositionApply(args, args.ws.activeNodeId, selection, reason, commandId);
      pushDebugTrace('runtime.reading-position.applying-begin', {
        activeNodeId: args.ws.activeNodeId,
        commandId: commandId ?? null,
        reason,
        selection
      });
    },
    completeAnchorNavigationRestore: (nodeId: string, reason: string) =>
      completeAnchorNavigationRestore(args, nodeId, reason),
    completeApplyingReadingPosition: (reason: string, selection?: EditorSelection, commandId?: string) => {
      completeReadingSyncState({
        activeNodeId: args.ws.activeNodeId,
        currentState: args.runtime.readingPositionSyncRef.current,
        commandId,
        reason,
        runtime: args.runtime,
        selection
      });
    },
    setReadingPositionSelection: (selection: EditorSelection) => setReadingPositionSelection(args, selection)
  };
}

export function createReadingPositionHandlers(args: BuildControllerLayoutPropsArgs) {
  return {
    ...createReadingPositionMutations(args),
    ...createReadingPositionAccessors(args)
  };
}

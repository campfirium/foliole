import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

function isSameSelection(left: EditorSelection, right: EditorSelection) {
  return left.from === right.from && left.to === right.to;
}

function getActiveReadingSelection(args: BuildControllerLayoutPropsArgs) {
  const current = args.runtime.readingPositionRef.current;
  return current.nodeId === args.ws.activeNodeId ? current.selection : null;
}

function getActiveReadingSyncState(args: BuildControllerLayoutPropsArgs) {
  const current = args.runtime.readingPositionSyncRef.current;
  return current.nodeId === args.ws.activeNodeId ? current.state : null;
}

function getActiveReadingViewportRatio(args: BuildControllerLayoutPropsArgs) {
  return getActiveReadingSyncState(args)?.targetViewportRatio ?? null;
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
}) {
  if (args.currentState.nodeId !== args.activeNodeId || !args.currentState.state) {
    return;
  }
  if (args.selection && !isSameSelection(args.currentState.state.targetSelection, args.selection)) {
    return;
  }
  args.runtime.readingPositionSyncRef.current = {
    nodeId: args.activeNodeId,
    state: null
  };
  pushDebugTrace('runtime.reading-position.applying-complete', {
    activeNodeId: args.activeNodeId,
    reason: args.reason,
    selection: args.currentState.state.targetSelection
  });
}

function createReadingPositionAccessors(args: BuildControllerLayoutPropsArgs) {
  return {
    getReadingPositionSelection: () => getActiveReadingSelection(args),
    getReadingPositionSyncState: () => getActiveReadingSyncState(args),
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

function createReadingPositionMutations(args: BuildControllerLayoutPropsArgs) {
  return {
    beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => {
      setReadingSyncState(args, nodeId, {
        reason: 'anchor-navigation',
        startedAt: Date.now(),
        targetSelection: selection
      });
      pushDebugTrace('runtime.anchor-navigation.applying-begin', {
        nodeId,
        selection
      });
    },
    beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => {
      setReadingSyncState(args, args.ws.activeNodeId, {
        reason,
        startedAt: Date.now(),
        targetSelection: selection
      });
      pushDebugTrace('runtime.reading-position.applying-begin', {
        activeNodeId: args.ws.activeNodeId,
        reason,
        selection
      });
    },
    completeAnchorNavigationRestore: (nodeId: string, reason: string) => {
      const current = args.runtime.readingPositionSyncRef.current;
      if (current.nodeId !== nodeId || current.state?.reason !== 'anchor-navigation') {
        return;
      }
      args.runtime.readingPositionSyncRef.current = {
        nodeId,
        state: null
      };
      pushDebugTrace('runtime.anchor-navigation.applying-complete', {
        nodeId,
        reason,
        selection: current.state?.targetSelection ?? null
      });
    },
    completeApplyingReadingPosition: (reason: string, selection?: EditorSelection) => {
      completeReadingSyncState({
        activeNodeId: args.ws.activeNodeId,
        currentState: args.runtime.readingPositionSyncRef.current,
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

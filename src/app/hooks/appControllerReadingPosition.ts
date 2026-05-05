import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

function isSameSelection(left: EditorSelection, right: EditorSelection) {
  return left.from === right.from && left.to === right.to;
}

function shouldClearAppliedReadingSelection(reason: string) {
  return (
    reason === 'anchor-navigation' ||
    reason === 'node-navigation' ||
    reason === 'reveal-anchor' ||
    reason === 'reveal-selection' ||
    reason === 'reveal-position'
  );
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

function getActiveReadingViewportMode(args: BuildControllerLayoutPropsArgs) {
  return getActiveReadingSyncState(args)?.targetViewportMode ?? null;
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
  if (
    shouldClearAppliedReadingSelection(args.currentState.state.reason) &&
    args.runtime.readingPositionRef.current.nodeId === args.activeNodeId &&
    args.runtime.readingPositionRef.current.selection &&
    isSameSelection(args.runtime.readingPositionRef.current.selection, args.currentState.state.targetSelection)
  ) {
    args.runtime.readingPositionRef.current = {
      nodeId: args.activeNodeId,
      selection: null
    };
  }
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

function beginReadingPositionApply(
  args: BuildControllerLayoutPropsArgs,
  nodeId: string | null,
  selection: EditorSelection,
  reason: string
) {
  setReadingSyncState(args, nodeId, {
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
  if (
    args.runtime.readingPositionRef.current.nodeId === nodeId &&
    args.runtime.readingPositionRef.current.selection &&
    isSameSelection(args.runtime.readingPositionRef.current.selection, current.state.targetSelection)
  ) {
    args.runtime.readingPositionRef.current = {
      nodeId,
      selection: null
    };
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
}

function createReadingPositionMutations(args: BuildControllerLayoutPropsArgs) {
  return {
    beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => {
      beginReadingPositionApply(args, nodeId, selection, 'anchor-navigation');
      pushDebugTrace('runtime.anchor-navigation.applying-begin', {
        nodeId,
        selection
      });
    },
    beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => {
      beginReadingPositionApply(args, args.ws.activeNodeId, selection, reason);
      pushDebugTrace('runtime.reading-position.applying-begin', {
        activeNodeId: args.ws.activeNodeId,
        reason,
        selection
      });
    },
    completeAnchorNavigationRestore: (nodeId: string, reason: string) =>
      completeAnchorNavigationRestore(args, nodeId, reason),
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

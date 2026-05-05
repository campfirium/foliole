import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createReadingPositionHandlers(args: BuildControllerLayoutPropsArgs) {
  return {
    beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => {
      args.runtime.readingPositionSyncRef.current = {
        nodeId,
        state: {
          reason: 'anchor-navigation',
          startedAt: Date.now(),
          targetSelection: selection
        }
      };
      pushDebugTrace('runtime.anchor-navigation.applying-begin', {
        nodeId,
        selection
      });
    },
    beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => {
      args.runtime.readingPositionSyncRef.current = {
        nodeId: args.ws.activeNodeId,
        state: {
          reason,
          startedAt: Date.now(),
          targetSelection: selection
        }
      };
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
    completeApplyingReadingPosition: (reason: string) => {
      const current = args.runtime.readingPositionSyncRef.current;
      args.runtime.readingPositionSyncRef.current = {
        nodeId: args.ws.activeNodeId,
        state: null
      };
      pushDebugTrace('runtime.reading-position.applying-complete', {
        activeNodeId: args.ws.activeNodeId,
        reason,
        selection: current.state?.targetSelection ?? null
      });
    },
    getReadingPositionSelection: () => {
      const current = args.runtime.readingPositionRef.current;
      if (current.nodeId !== args.ws.activeNodeId) {
        return null;
      }
      return current.selection;
    },
    getReadingPositionSyncState: () => {
      const current = args.runtime.readingPositionSyncRef.current;
      if (current.nodeId !== args.ws.activeNodeId) {
        return null;
      }
      return current.state;
    },
    setReadingPositionSelection: (selection: EditorSelection) => {
      args.runtime.readingPositionRef.current = {
        nodeId: args.ws.activeNodeId,
        selection
      };
      pushDebugTrace('runtime.reading-position.updated', {
        activeNodeId: args.ws.activeNodeId,
        selection
      });
    }
  };
}

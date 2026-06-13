import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ReadingPositionRestoreCommand } from '../../features/editor/model/editorRestoreCommand';
import { VIRTUAL_REMOVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { requestPdfSearch } from '../../features/pdf/model/pdfSystemRegistry';
import { setSelectedRemovedSource } from '../components/removedSourceSelectionStore';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { buildSearchState, toSearchNodesById } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';
import { requestReadingPositionApply } from './readingPositionRequests';
import type { ReadingPositionSyncState } from './useAppRuntime';

interface SearchReadingPositionRuntime {
  bumpReadingPositionRequest: () => void;
  readingPositionRef: {
    current: {
      nodeId: string | null;
      selection: { from: number; to: number } | null;
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

interface SearchStateArgs {
  externalLibrary?: {
    openExternalSelection: (selection: { absolutePath: string; folderId: string; kind: 'document' }) => void;
  };
  searchPreview?: {
    openSearchPreview: (result: WorkspaceSearchResult) => void;
  };
  nav: {
    handleSelectNode: (nodeId: string) => void;
  };
  runtime: {
    editorRef?: {
      current: EditorAdapter | null;
    };
    isSearchPaletteOpen: boolean;
    setIsSearchPaletteOpen: (open: boolean) => void;
  } & Partial<SearchReadingPositionRuntime>;
  trash: {
    closeTrashView: () => void;
  };
  virtualView?: {
    closeVirtualView: () => void;
    openVirtualView?: (nodeId?: string) => void;
  };
  ws: {
    activeNodeId?: string | null;
    nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'];
    nodeOrder: string[];
    nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
    setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState'];
    trashedNodeIds: string[];
  };
}

function hasReadingPositionRuntime(
  runtime: SearchStateArgs['runtime']
): runtime is SearchStateArgs['runtime'] & SearchReadingPositionRuntime {
  return Boolean(
    runtime.bumpReadingPositionRequest &&
    runtime.readingPositionRef &&
    runtime.readingPositionRestoreCommandRef &&
    runtime.readingPositionRestoreCommandSeqRef &&
    runtime.readingPositionSyncRef
  );
}

function requestNodeMatchJump(args: {
  result: WorkspaceSearchResult;
  runtime: SearchStateArgs['runtime'];
}) {
  if (args.result.kind !== 'node' || !args.result.nodeMatch || !hasReadingPositionRuntime(args.runtime)) {
    return;
  }
  requestReadingPositionApply({
    nodeId: args.result.id,
    reason: 'workspace-search-result',
    runtime: args.runtime,
    selection: {
      from: args.result.nodeMatch.from,
      to: args.result.nodeMatch.to
    },
    selectionMode: 'range',
    targetViewportMode: 'center'
  });
}

function revealActiveNodeMatch(args: {
  result: WorkspaceSearchResult;
  runtime: SearchStateArgs['runtime'];
  ws: SearchStateArgs['ws'];
}) {
  if (args.result.kind !== 'node' || !args.result.nodeMatch || args.ws.activeNodeId !== args.result.id) {
    return;
  }
  const editor = args.runtime.editorRef?.current;
  if (!editor) {
    return;
  }
  const selection = {
    from: args.result.nodeMatch.from,
    to: args.result.nodeMatch.to
  };
  editor.setSelection(selection);
  if (editor.revealSelectionCentered) {
    editor.revealSelectionCentered(selection);
    return;
  }
  editor.revealSelection(selection);
}

export interface AppSearchState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  trashedNodeIds: string[];
}

export function buildControllerSearchState(args: SearchStateArgs): AppSearchState {
  const isOpen = args.runtime.isSearchPaletteOpen;
  return buildSearchState(
    isOpen,
    isOpen ? args.ws.nodeOrder : [],
    isOpen ? toSearchNodesById(args.ws.nodesById) : {},
    args.ws.trashedNodeIds,
    () => args.runtime.setIsSearchPaletteOpen(false),
    (result, options) => {
      args.trash.closeTrashView();
      args.virtualView?.closeVirtualView();
      if (result.kind === 'external' && result.externalMatch?.importedNodeId) {
        args.nav.handleSelectNode(result.externalMatch.importedNodeId);
        args.runtime.setIsSearchPaletteOpen(false);
        return;
      }
      if (options?.preview) {
        args.searchPreview?.openSearchPreview(result);
        args.runtime.setIsSearchPaletteOpen(false);
        return;
      }
      if (result.kind === 'removed' && result.removedMatch) {
        setSelectedRemovedSource(result.removedMatch.entry);
        args.virtualView?.openVirtualView?.(VIRTUAL_REMOVED_NODE_ID);
        args.runtime.setIsSearchPaletteOpen(false);
        return;
      }
      if (result.kind === 'external' && result.externalMatch) {
        const request = {
          absolutePath: result.externalMatch.absolutePath,
          folderId: result.externalMatch.folderId
        };
        args.externalLibrary?.openExternalSelection({ ...request, kind: 'document' });
        args.runtime.setIsSearchPaletteOpen(false);
        return;
      }
      if (result.kind === 'node' && result.nodeMatch) {
        const existingViewState = args.ws.nodeViewById[result.id];
        args.ws.setNodeViewState(result.id, {
          scrollTop: existingViewState?.scrollTop ?? 0,
          selection: {
            from: result.nodeMatch.from,
            to: result.nodeMatch.to
          }
        });
      }
      args.nav.handleSelectNode(result.id);
      requestNodeMatchJump({ result, runtime: args.runtime });
      revealActiveNodeMatch({ result, runtime: args.runtime, ws: args.ws });
      if (result.kind === 'pdf' && result.pdfMatch) {
        requestPdfSearch(result.id, {
          matchStart: result.pdfMatch.matchStart,
          page: result.pdfMatch.page,
          query: result.pdfMatch.query
        });
      }
      args.runtime.setIsSearchPaletteOpen(false);
    }
  );
}

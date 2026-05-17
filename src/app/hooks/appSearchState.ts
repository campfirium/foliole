import { VIRTUAL_REMOVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { requestPdfSearch } from '../../features/pdf/model/pdfSystemRegistry';
import { setSelectedRemovedSource } from '../components/removedSourceSelectionStore';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { buildSearchState, toSearchNodesById } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';

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
    isSearchPaletteOpen: boolean;
    setIsSearchPaletteOpen: (open: boolean) => void;
  };
  trash: {
    closeTrashView: () => void;
  };
  virtualView?: {
    closeVirtualView: () => void;
    openVirtualView?: (nodeId?: string) => void;
  };
  ws: {
    nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'];
    nodeOrder: string[];
    nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
    setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState'];
    trashedNodeIds: string[];
  };
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

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { requestPdfAnchorJump, requestPdfSearch } from '../../features/pdf/model/pdfSystemBridge';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { buildSearchState, toSearchNodesById } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';

interface SearchStateArgs {
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
  ws: {
    nodeOrder: string[];
    nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
    trashedNodeIds: string[];
  };
}

export interface AppSearchState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
  trashedNodeIds: string[];
}

export function buildControllerSearchState(args: SearchStateArgs): AppSearchState {
  return buildSearchState(
    args.runtime.isSearchPaletteOpen,
    args.ws.nodeOrder,
    toSearchNodesById(args.ws.nodesById),
    args.ws.trashedNodeIds,
    () => args.runtime.setIsSearchPaletteOpen(false),
    (result) => {
      args.trash.closeTrashView();
      args.nav.handleSelectNode(result.id);
      if (result.kind === 'pdf' && result.pdfMatch) {
        requestPdfAnchorJump(result.id, {
          page: result.pdfMatch.page,
          x: 0.5,
          y: Math.min(0.95, Math.max(0.05, result.pdfMatch.matchStart / Math.max(1, result.pdfMatch.pageTextLength)))
        });
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

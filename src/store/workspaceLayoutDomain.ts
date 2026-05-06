import { useShallow } from 'zustand/react/shallow';

import {
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore,
  type WorkspaceLayoutState
} from './workspaceStore';

export { DOCUMENT_WIDTH_DEFAULT, LIST_WIDTH_DEFAULT, RIGHT_SIDEBAR_WIDTH_DEFAULT };
export type { WorkspaceLayoutState };

export interface WorkspaceLayoutActions {
  resetLayout: () => void;
  setDocumentMaxWidth: (width: number) => void;
  setListCollapsed: (collapsed: boolean) => void;
  setListWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
}

export type WorkspaceLayoutDomainState = WorkspaceLayoutState & WorkspaceLayoutActions;

export function useWorkspaceLayoutState(): WorkspaceLayoutDomainState {
  return useWorkspaceStore(
    useShallow((state) => ({
      documentMaxWidth: state.layout.documentMaxWidth,
      isListCollapsed: state.layout.isListCollapsed,
      isRightSidebarCollapsed: state.layout.isRightSidebarCollapsed,
      listWidth: state.layout.listWidth,
      resetLayout: state.resetLayout,
      rightSidebarWidth: state.layout.rightSidebarWidth,
      setDocumentMaxWidth: state.setDocumentMaxWidth,
      setListCollapsed: state.setListCollapsed,
      setListWidth: state.setListWidth,
      setRightSidebarCollapsed: state.setRightSidebarCollapsed,
      setRightSidebarWidth: state.setRightSidebarWidth
    }))
  );
}

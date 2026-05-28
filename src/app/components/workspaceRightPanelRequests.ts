import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const WORKSPACE_RIGHT_PANEL_REQUEST_EVENT = 'foliole:workspace-right-panel-request';

interface WorkspaceRightPanelRequestDetail {
  panelId: WorkspaceRightPanelId;
}

export function requestWorkspaceRightPanelOpen(panelId: WorkspaceRightPanelId) {
  window.dispatchEvent(new CustomEvent<WorkspaceRightPanelRequestDetail>(WORKSPACE_RIGHT_PANEL_REQUEST_EVENT, {
    detail: { panelId }
  }));
}

export function subscribeWorkspaceRightPanelRequests(listener: (panelId: WorkspaceRightPanelId) => void) {
  const handleRequest = (event: Event) => {
    const panelId = (event as CustomEvent<WorkspaceRightPanelRequestDetail>).detail?.panelId;
    if (panelId) listener(panelId);
  };
  window.addEventListener(WORKSPACE_RIGHT_PANEL_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(WORKSPACE_RIGHT_PANEL_REQUEST_EVENT, handleRequest);
}

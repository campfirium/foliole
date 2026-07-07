export function loadWorkspaceRightSidebarAssistantPanel() {
  return import('./WorkspaceRightSidebarAssistantPanel');
}

export function loadWorkspaceRightSidebarBacklinksPanel() {
  return import('./WorkspaceRightSidebarBacklinksPanel');
}

export function loadWorkspaceRightSidebarDevPanel() {
  return import('./WorkspaceRightSidebarDevPanel');
}

export function loadWorkspaceRightSidebarHighlightsPanel() {
  return import('./WorkspaceRightSidebarHighlightsPanel');
}

export function loadWorkspaceRightSidebarOutlinePanel() {
  return import('./WorkspaceRightSidebarOutlinePanel');
}

export function loadWorkspaceRightSidebarPerformancePanel() {
  return import('./WorkspaceRightSidebarPerformancePanel');
}

export function loadWorkspaceRightSidebarReviewQueuePanel() {
  return import('./WorkspaceRightSidebarReviewQueuePanel');
}

let workspaceRightSidebarPanelsPrewarm: Promise<void> | null = null;

export function prewarmWorkspaceRightSidebarPanels() {
  workspaceRightSidebarPanelsPrewarm ??= Promise.allSettled([
    loadWorkspaceRightSidebarAssistantPanel(),
    loadWorkspaceRightSidebarOutlinePanel(),
    loadWorkspaceRightSidebarBacklinksPanel(),
    loadWorkspaceRightSidebarHighlightsPanel(),
    loadWorkspaceRightSidebarReviewQueuePanel(),
    loadWorkspaceRightSidebarDevPanel(),
    loadWorkspaceRightSidebarPerformancePanel()
  ]).then(() => undefined);
  return workspaceRightSidebarPanelsPrewarm;
}

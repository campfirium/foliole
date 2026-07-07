import { lazy } from 'react';

import {
  loadWorkspaceRightSidebarAssistantPanel,
  loadWorkspaceRightSidebarBacklinksPanel,
  loadWorkspaceRightSidebarDevPanel,
  loadWorkspaceRightSidebarHighlightsPanel,
  loadWorkspaceRightSidebarOutlinePanel,
  loadWorkspaceRightSidebarPerformancePanel,
  loadWorkspaceRightSidebarReviewQueuePanel
} from './workspaceRightSidebarPanelLoaders';

export const WorkspaceRightSidebarAssistantPanel = lazy(() =>
  loadWorkspaceRightSidebarAssistantPanel().then((module) => ({
    default: module.WorkspaceRightSidebarAssistantPanel
  }))
);
export const WorkspaceRightSidebarBacklinksPanel = lazy(() =>
  loadWorkspaceRightSidebarBacklinksPanel().then((module) => ({
    default: module.WorkspaceRightSidebarBacklinksPanel
  }))
);
export const WorkspaceRightSidebarDevPanel = lazy(() =>
  loadWorkspaceRightSidebarDevPanel().then((module) => ({
    default: module.WorkspaceRightSidebarDevPanel
  }))
);
export const WorkspaceRightSidebarHighlightsPanel = lazy(() =>
  loadWorkspaceRightSidebarHighlightsPanel().then((module) => ({
    default: module.WorkspaceRightSidebarHighlightsPanel
  }))
);
export const WorkspaceRightSidebarOutlinePanel = lazy(() =>
  loadWorkspaceRightSidebarOutlinePanel().then((module) => ({
    default: module.WorkspaceRightSidebarOutlinePanel
  }))
);
export const WorkspaceRightSidebarPerformancePanel = lazy(() =>
  loadWorkspaceRightSidebarPerformancePanel().then((module) => ({
    default: module.WorkspaceRightSidebarPerformancePanel
  }))
);
export const WorkspaceRightSidebarReviewQueuePanel = lazy(() =>
  loadWorkspaceRightSidebarReviewQueuePanel().then((module) => ({
    default: module.WorkspaceRightSidebarReviewQueuePanel
  }))
);

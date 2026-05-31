import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';
import { requestWorkspaceRightPanelOpen } from '../components/workspaceRightPanelRequests';

import type { useWorkspaceControllerState } from './appControllerState';
import { createOpenGuidedSampleCommand } from './openGuidedSampleCommand';
import { openReadwiseReaderSettings } from './settingsOverlayRequest';

export function createPaletteRuntimeActions(args: {
  layoutProps: WorkspaceLayoutProps;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
}) {
  return {
    openGuidedSample: createOpenGuidedSampleCommand(
      args.trash.closeTrashView,
      args.layoutProps.nodeList.onOpenNotesView,
      useWorkspaceStore.getState().startReviewSession,
      args.layoutProps.review.onStartStudyMode
    ),
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    openNotesView: args.layoutProps.nodeList.onOpenNotesView,
    openPerformancePanel: () => requestWorkspaceRightPanelOpen('performance'),
    openPostponeTopicPanel: () => args.layoutProps.review.onOpenPostponeTopicPanel(),
    openReadwiseReaderSettings: () => openReadwiseReaderSettings(args.runtime),
    openTrashView: args.trash.openTrashView,
    recordRecentCommand: args.runtime.recordRecentCommand,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen: args.runtime.setIsMoveToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    trashViewOpen: args.trash.isTrashViewOpen
  };
}

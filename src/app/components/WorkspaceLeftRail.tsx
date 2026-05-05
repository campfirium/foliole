import { memo } from 'react';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export interface WorkspaceLeftRailProps {
  canStartStudyMode: boolean;
  isImportManagementOpen: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onToggleReviewSession: () => void;
  reviewDueCount: number;
  showStudyDock?: boolean;
}

export interface WorkspaceLeftRailSource {
  canStartStudyMode: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  onOpenSettings: () => void;
  onToggleReviewSession: () => void;
  reviewDueCount: number;
}

export function selectWorkspaceLeftRailProps({
  isImportManagementOpen,
  onOpenImportManagement,
  onStartClipboardImport,
  onStartImport,
  props,
  showStudyDock
}: {
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  props: WorkspaceLeftRailSource;
  showStudyDock?: boolean;
}): WorkspaceLeftRailProps {
  return {
    canStartStudyMode: props.canStartStudyMode,
    isImportManagementOpen,
    isSettingsOpen: props.isSettingsOpen,
    isStudyMode: props.isStudyMode,
    onOpenImportManagement,
    onOpenSettings: props.onOpenSettings,
    onStartClipboardImport,
    onStartImport,
    onToggleReviewSession: props.onToggleReviewSession,
    reviewDueCount: props.reviewDueCount,
    showStudyDock
  };
}

export const WorkspaceLeftRail = memo(function WorkspaceLeftRail({
  canStartStudyMode,
  isImportManagementOpen,
  isSettingsOpen,
  isStudyMode,
  onOpenImportManagement,
  onOpenSettings,
  onStartClipboardImport,
  onStartImport,
  onToggleReviewSession,
  reviewDueCount,
  showStudyDock,
}: WorkspaceLeftRailProps) {
  return (
    <div className="workspace-region-main-rail h-full max-[1080px]:hidden">
      <WorkspaceSideToolbar
        canStartStudyMode={canStartStudyMode}
        isImportManagementOpen={isImportManagementOpen}
        isSettingsOpen={isSettingsOpen}
        isStudyMode={isStudyMode}
        reviewDueCount={reviewDueCount}
        showStudyDock={showStudyDock}
        onOpenImportManagement={onOpenImportManagement}
        onOpenSettings={onOpenSettings}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={onToggleReviewSession}
      />
    </div>
  );
});

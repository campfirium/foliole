import { memo } from 'react';

import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export interface WorkspaceLeftRailProps {
  canStartStudyMode: boolean;
  isImportManagementOpen: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onRunRailAction?: (commandId: string) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onToggleReviewSession: () => void;
  reviewDueCount: number;
  showStudyDock?: boolean;
}

export type WorkspaceLeftRailSource = Pick<WorkspaceLayoutProps, 'imports' | 'review' | 'settings'>;

export function selectWorkspaceLeftRailProps({
  props,
  showStudyDock
}: {
  props: WorkspaceLeftRailSource;
  showStudyDock?: boolean;
}): WorkspaceLeftRailProps {
  const { imports, review, settings } = props;
  return {
    canStartStudyMode: review.canStartStudyMode,
    isImportManagementOpen: imports.isImportManagementOpen,
    isSettingsOpen: settings.isSettingsOpen,
    isStudyMode: review.isStudyMode,
    onOpenImportManagement: imports.onOpenImportManagement,
    onOpenSettings: settings.onOpenSettings,
    onRunRailAction: settings.onRunRailAction,
    onStartClipboardImport: imports.onStartClipboardImport,
    onStartImport: () => void imports.onRunImportFile(),
    onToggleReviewSession: review.onToggleReviewSession,
    reviewDueCount: review.reviewDueCount,
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
  onRunRailAction,
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
        onRunRailAction={onRunRailAction}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={onToggleReviewSession}
      />
    </div>
  );
});

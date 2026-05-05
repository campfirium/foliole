import { memo } from 'react';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export const WorkspaceLeftRail = memo(function WorkspaceLeftRail({
  isImportManagementOpen,
  onOpenImportManagement,
  onStartClipboardImport,
  onStartImport,
  showStudyDock,
  props
}: {
  isImportManagementOpen: boolean;
  onOpenImportManagement: () => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  showStudyDock?: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className="h-full bg-bg-panel max-[1080px]:hidden">
      <WorkspaceSideToolbar
        canStartStudyMode={props.canStartStudyMode}
        isImportManagementOpen={isImportManagementOpen}
        isSettingsOpen={props.isSettingsOpen}
        isStudyMode={props.isStudyMode}
        reviewDueCount={props.reviewDueCount}
        showStudyDock={showStudyDock}
        onOpenImportManagement={onOpenImportManagement}
        onOpenSettings={props.onOpenSettings}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={props.onToggleReviewSession}
      />
    </div>
  );
});

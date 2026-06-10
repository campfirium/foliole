import { memo } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

export interface WorkspaceLeftRailProps {
  canStartStudyMode: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  onOpenSettings: () => void;
  onRunRailAction?: (commandId: string) => void;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onToggleReviewSession: () => void;
  showStudyDock?: boolean;
}

export type WorkspaceLeftRailSource = Pick<WorkspaceLayoutProps, 'imports' | 'review' | 'settings'>;

export function selectWorkspaceLeftRailProps({
  onStartClipboardImport,
  onStartImport,
  props,
  showStudyDock
}: {
  onStartClipboardImport?: () => void;
  onStartImport?: () => void;
  props: WorkspaceLeftRailSource;
  showStudyDock?: boolean;
}): WorkspaceLeftRailProps {
  const { imports, review, settings } = props;
  return {
    canStartStudyMode: review.canStartStudyMode,
    isSettingsOpen: settings.isSettingsOpen,
    isStudyMode: review.isStudyMode,
    onOpenSettings: settings.onOpenSettings,
    onStartClipboardImport: onStartClipboardImport ?? imports.onStartClipboardImport,
    onStartImport: onStartImport ?? (() => void imports.onRunImportFile()),
    onToggleReviewSession: review.onToggleReviewSession,
    ...definedProps({
      onRunRailAction: settings.onRunRailAction,
      showStudyDock
    })
  };
}

export const WorkspaceLeftRail = memo(function WorkspaceLeftRail({
  canStartStudyMode,
  isSettingsOpen,
  isStudyMode,
  onOpenSettings,
  onRunRailAction,
  onStartClipboardImport,
  onStartImport,
  onToggleReviewSession,
  showStudyDock,
}: WorkspaceLeftRailProps) {
  return (
    <div className="workspace-region-main-rail h-full">
      <WorkspaceSideToolbar
        canStartStudyMode={canStartStudyMode}
        isSettingsOpen={isSettingsOpen}
        isStudyMode={isStudyMode}
        onOpenSettings={onOpenSettings}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
        onToggleReviewSession={onToggleReviewSession}
        {...definedProps({ onRunRailAction, showStudyDock })}
      />
    </div>
  );
});

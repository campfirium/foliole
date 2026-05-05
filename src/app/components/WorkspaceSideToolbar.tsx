import { ClipboardPaste, FileUp, Folders, Route, Settings } from 'lucide-react';

import { AppIconButton, AppToolbar, AppTooltip, AppTooltipContent, AppTooltipTrigger, ToolbarActionGroup } from '../../shared/ui';

import { getWorkspaceSurfaceDividerColor } from './WorkspaceSurfaceRowOverlay';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isImportManagementOpen: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  reviewDueCount: number;
  showStudyDock?: boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onToggleReviewSession: () => void;
}

function ImportActions({
  isImportManagementOpen,
  onStartClipboardImport,
  onStartImport,
  onOpenImportManagement
}: {
  isImportManagementOpen: boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onOpenImportManagement: () => void;
}) {
  return (
    <ToolbarActionGroup ariaLabel="Workspace import actions" className="w-full gap-0" fullWidth orientation="vertical">
      <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<FileUp aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Import"
          onClick={onStartImport}
        />
      </div>
      <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<ClipboardPaste aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Clipboard Import *"
          onClick={onStartClipboardImport}
        />
      </div>
      <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isImportManagementOpen}
          icon={<Folders aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Import Management"
          onClick={onOpenImportManagement}
        />
      </div>
    </ToolbarActionGroup>
  );
}

function SettingsAction({ isSettingsOpen, onOpenSettings }: { isSettingsOpen: boolean; onOpenSettings: () => void }) {
  return (
    <ToolbarActionGroup
      ariaLabel="Workspace settings actions"
      className="h-[var(--workspace-top-toolbar-height)] w-full justify-center"
      fullWidth
      orientation="vertical"
    >
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isSettingsOpen}
        icon={<Settings aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Settings"
        onClick={onOpenSettings}
      />
    </ToolbarActionGroup>
  );
}

function StudyAction({
  canStartStudyMode,
  isStudyMode,
  onToggleReviewSession,
  reviewStatusText
}: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  reviewStatusText: string;
}) {
  return (
    <ToolbarActionGroup
      ariaLabel="Workspace study actions"
      className="h-[var(--workspace-bottom-toolbar-height)] w-full justify-center px-1"
      fullWidth
      orientation="vertical"
    >
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <span className="inline-flex">
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
              data-active={isStudyMode}
              disabled={!canStartStudyMode && !isStudyMode}
              icon={<Route aria-hidden="true" size={16} strokeWidth={1.75} />}
              label="Study"
              onClick={onToggleReviewSession}
            />
          </span>
        </AppTooltipTrigger>
        <AppTooltipContent>{reviewStatusText}</AppTooltipContent>
      </AppTooltip>
    </ToolbarActionGroup>
  );
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isImportManagementOpen,
  isStudyMode,
  isSettingsOpen,
  reviewDueCount,
  showStudyDock = true,
  onStartClipboardImport,
  onStartImport,
  onOpenImportManagement,
  onOpenSettings,
  onToggleReviewSession
}: WorkspaceSideToolbarProps) {
  const reviewStatusText = isStudyMode
    ? `Reviewing (${Math.max(reviewDueCount, 0)} remaining)`
    : reviewDueCount > 0
      ? `Start review (${reviewDueCount} due)`
      : 'Start review (no due cards)';

  return (
    <AppToolbar
      aria-label="Workspace side toolbar"
      className="workspace-region-main-rail flex h-full w-[var(--workspace-rail-width)] flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <ImportActions
          isImportManagementOpen={isImportManagementOpen}
          onOpenImportManagement={onOpenImportManagement}
          onStartClipboardImport={onStartClipboardImport}
          onStartImport={onStartImport}
        />
        <div className="flex-1" />
        <SettingsAction isSettingsOpen={isSettingsOpen} onOpenSettings={onOpenSettings} />
      </div>
      {showStudyDock ? (
        <>
          {isStudyMode ? (
            <div
              aria-hidden="true"
              className="w-full shrink-0 border-t"
              data-testid="workspace-study-divider"
              style={{ borderTopColor: getWorkspaceSurfaceDividerColor('main', 'rail') }}
            />
          ) : null}
          <div className="flex h-[var(--workspace-bottom-toolbar-height)] w-full shrink-0 items-center justify-center">
            <StudyAction
              canStartStudyMode={canStartStudyMode}
              isStudyMode={isStudyMode}
              onToggleReviewSession={onToggleReviewSession}
              reviewStatusText={reviewStatusText}
            />
          </div>
        </>
      ) : null}
    </AppToolbar>
  );
}

export function WorkspaceStudyDockTrigger({
  canStartStudyMode,
  isStudyMode,
  onToggleReviewSession,
  reviewDueCount
}: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  reviewDueCount: number;
}) {
  const reviewStatusText = isStudyMode
    ? `Reviewing (${Math.max(reviewDueCount, 0)} remaining)`
    : reviewDueCount > 0
      ? `Start review (${reviewDueCount} due)`
      : 'Start review (no due cards)';

  return (
    <div
      className="flex h-[var(--workspace-bottom-toolbar-height)] w-[var(--workspace-rail-width)] shrink-0 items-center justify-center"
      style={{ backgroundColor: 'var(--workspace-region-footer-rail-bg)' }}
    >
      <StudyAction
        canStartStudyMode={canStartStudyMode}
        isStudyMode={isStudyMode}
        onToggleReviewSession={onToggleReviewSession}
        reviewStatusText={reviewStatusText}
      />
    </div>
  );
}

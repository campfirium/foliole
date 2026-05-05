import { ClipboardPaste, FileUp, Folders, Route, Settings } from 'lucide-react';

import { AppIconButton, AppToolbar, AppTooltip, AppTooltipContent, AppTooltipTrigger, ToolbarActionGroup } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isImportManagementOpen: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  reviewDueCount: number;
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
    <ToolbarActionGroup ariaLabel="Workspace import actions" className="gap-2 py-1" fullWidth orientation="vertical">
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<FileUp aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Import"
        onClick={onStartImport}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<ClipboardPaste aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Clipboard Import *"
        onClick={onStartClipboardImport}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isImportManagementOpen}
        icon={<Folders aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Import Management"
        onClick={onOpenImportManagement}
      />
    </ToolbarActionGroup>
  );
}

function SettingsAction({ isSettingsOpen, onOpenSettings }: { isSettingsOpen: boolean; onOpenSettings: () => void }) {
  return (
    <ToolbarActionGroup ariaLabel="Workspace settings actions" className="h-[56px]" fullWidth orientation="vertical">
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

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isImportManagementOpen,
  isStudyMode,
  isSettingsOpen,
  reviewDueCount,
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
      className="flex h-full w-[40px] flex-col items-center border-r border-[#d9d9d6] bg-[#f6f6f6] pb-0 pt-2"
    >
      <ImportActions
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={onOpenImportManagement}
        onStartClipboardImport={onStartClipboardImport}
        onStartImport={onStartImport}
      />
      <div className="flex-1" />
      <SettingsAction isSettingsOpen={isSettingsOpen} onOpenSettings={onOpenSettings} />
      <ToolbarActionGroup
        ariaLabel="Workspace study actions"
        className={`h-[56px] bg-[#f6f6f6]${
          isStudyMode ? ' border-t border-border' : ''
        }`}
        fullWidth
        orientation="vertical"
      >
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <span className="inline-flex">
              <AppIconButton
                className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                data-active={false}
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
    </AppToolbar>
  );
}

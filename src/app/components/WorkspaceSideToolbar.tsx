import { Route, Settings } from 'lucide-react';

import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  reviewDueCount: number;
  onOpenSettings: () => void;
  onToggleReviewSession: () => void;
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isStudyMode,
  isSettingsOpen,
  reviewDueCount,
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
      <div className="flex-1" />
      <div className="flex h-[56px] w-full flex-none items-center justify-center">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isSettingsOpen}
          icon={<Settings aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
      <div
        className={`flex h-[56px] w-full flex-none items-center justify-center bg-[#f6f6f6]${
          isStudyMode ? ' border-t border-border' : ''
        }`}
      >
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          data-active={false}
          disabled={!canStartStudyMode && !isStudyMode}
          icon={<Route aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Study"
          onClick={onToggleReviewSession}
          title={reviewStatusText}
        />
      </div>
    </AppToolbar>
  );
}

import { BookOpen, Settings } from 'lucide-react';

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
      className="flex h-full w-[40px] flex-col items-center gap-2 border-r border-[#d9d9d6] bg-[#f6f6f6] px-1 py-2"
    >
      <div className="relative">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isStudyMode}
          disabled={!canStartStudyMode && !isStudyMode}
          icon={<BookOpen aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Study"
          onClick={onToggleReviewSession}
          title={reviewStatusText}
        />
        {reviewDueCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-[#c2410c] px-1 text-[9px] font-semibold leading-none text-white">
            {reviewDueCount > 99 ? '99+' : reviewDueCount}
          </span>
        ) : null}
      </div>
      <div className="flex-1" />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isSettingsOpen}
        icon={<Settings aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Settings"
        onClick={onOpenSettings}
      />
    </AppToolbar>
  );
}

import { BookOpen, Settings } from 'lucide-react';

import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  onOpenSettings: () => void;
  onStartStudyMode: () => void;
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isStudyMode,
  isSettingsOpen,
  onOpenSettings,
  onStartStudyMode
}: WorkspaceSideToolbarProps) {
  return (
    <AppToolbar
      aria-label="Workspace side toolbar"
      className="flex h-full w-[40px] flex-col items-center gap-2 border-r border-[#d9d9d6] bg-[#f6f6f6] px-1 py-2"
    >
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isStudyMode}
        disabled={!canStartStudyMode || isStudyMode}
        icon={<BookOpen aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Study"
        onClick={onStartStudyMode}
      />
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

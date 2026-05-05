import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

export function WorkspaceToolbar({
  canGoBack,
  canGoForward,
  canGoParent,
  onGoBack,
  onGoForward,
  onGoParent
}: WorkspaceToolbarProps) {
  return (
    <AppToolbar
      aria-label="Workspace toolbar"
      className="flex min-h-[40px] flex-none items-center border-b border-border bg-bg-subtle px-3"
    >
      <div className="flex gap-1">
        <AppIconButton
          className="size-7 rounded-md border border-transparent text-foreground/70 hover:border-border-strong hover:bg-accent/10 hover:text-foreground"
          disabled={!canGoBack}
          icon="←"
          label="Go back"
          onClick={onGoBack}
        />
        <AppIconButton
          className="size-7 rounded-md border border-transparent text-foreground/70 hover:border-border-strong hover:bg-accent/10 hover:text-foreground"
          disabled={!canGoForward}
          icon="→"
          label="Go forward"
          onClick={onGoForward}
        />
        <AppIconButton
          className="size-7 rounded-md border border-transparent text-foreground/70 hover:border-border-strong hover:bg-accent/10 hover:text-foreground"
          disabled={!canGoParent}
          icon="↑"
          label="Go to parent node"
          onClick={onGoParent}
        />
      </div>
    </AppToolbar>
  );
}

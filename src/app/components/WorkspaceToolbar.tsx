import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  listWidth: number;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

export function WorkspaceToolbar({
  canGoBack,
  canGoForward,
  canGoParent,
  listWidth,
  onGoBack,
  onGoForward,
  onGoParent
}: WorkspaceToolbarProps) {
  const dividerLeft = `calc(${listWidth}px + 14px)`;

  return (
    <AppToolbar
      aria-label="Workspace toolbar"
      className="relative flex min-h-[44px] flex-none items-center border-b border-border bg-bg-subtle px-3"
    >
      <div className="flex gap-1">
        <AppIconButton
          className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!canGoBack}
          icon="←"
          label="Go back"
          onClick={onGoBack}
        />
        <AppIconButton
          className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!canGoForward}
          icon="→"
          label="Go forward"
          onClick={onGoForward}
        />
        <AppIconButton
          className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!canGoParent}
          icon="↑"
          label="Go to parent node"
          onClick={onGoParent}
        />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-border max-[1080px]:hidden"
        style={{ left: dividerLeft }}
      />
    </AppToolbar>
  );
}

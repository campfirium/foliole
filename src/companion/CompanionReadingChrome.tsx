import { EllipsisVertical, Highlighter, Info, ListTree, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';

function ReadingChromeButton(props: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-companion-content/90 text-companion-text-secondary shadow-panel transition hover:bg-companion-subtle hover:text-foreground disabled:text-companion-text-tertiary"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function ReadingChrome(props: {
  onExit(): void;
  onOpenActions(): void;
  onOpenOutline(): void;
  onOpenSheet(sheet: 'font' | 'highlight' | 'info'): void;
  title: string;
}) {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base/95 px-4 pb-3 pt-3 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),12px)] backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center gap-2">
          <ReadingChromeButton icon={X} label="Exit" onClick={props.onExit} />
          <ReadingChromeButton icon={ListTree} label="Outline" onClick={props.onOpenOutline} />
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
            {props.title}
          </span>
          <ReadingChromeButton icon={SlidersHorizontal} label="Font" onClick={() => props.onOpenSheet('font')} />
          <ReadingChromeButton icon={Highlighter} label="Highlight" onClick={() => props.onOpenSheet('highlight')} />
          <ReadingChromeButton icon={Info} label="Info" onClick={() => props.onOpenSheet('info')} />
        </div>
      </div>
      <div className="fixed right-5 bottom-5 supports-[bottom:max(0px)]:bottom-[max(env(safe-area-inset-bottom),20px)] z-workspace-overlay flex items-center gap-2">
        <ReadingChromeButton icon={EllipsisVertical} label="More reading actions" onClick={props.onOpenActions} />
      </div>
    </>
  );
}

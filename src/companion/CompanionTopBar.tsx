import { ChevronLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type TopBarAction = {
  icon: LucideIcon;
  label: string;
  onClick(): void;
};

function TopBarIconButton(props: TopBarAction) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function CompanionTopBar(props: {
  backLabel?: string;
  leftAction?: TopBarAction;
  onBack?: () => void;
  rightAction?: TopBarAction;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
  title?: string;
  visible: boolean;
}) {
  const hasTitleRow = Boolean(props.leftAction || props.rightAction || props.rightSlot || props.statusSlot || props.title);
  const hasChrome = Boolean(props.onBack || hasTitleRow);
  if (!props.visible || !hasChrome) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 -mx-6 bg-companion-base/95 px-6 pb-3 pt-4 backdrop-blur sm:-mx-7 sm:px-7">
      {props.onBack ? (
        <button
          className={`inline-flex items-center gap-2 text-sm font-medium text-companion-text-secondary transition hover:text-foreground ${hasTitleRow ? 'mb-3' : ''}`}
          onClick={props.onBack}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
          {props.backLabel ?? 'Back'}
        </button>
      ) : null}
      {hasTitleRow ? (
        <div className="flex min-h-10 items-center justify-between gap-3">
          <div className="flex w-10 justify-start">
            {props.leftAction ? <TopBarIconButton {...props.leftAction} /> : null}
          </div>
          {props.title ? (
            <h1 className="min-w-0 flex-1 truncate text-center text-2xl font-semibold leading-tight text-foreground">{props.title}</h1>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="flex min-w-10 justify-end gap-1">
            {props.statusSlot}
            {props.rightSlot ?? (props.rightAction ? <TopBarIconButton {...props.rightAction} /> : null)}
          </div>
        </div>
      ) : null}
    </header>
  );
}

import { ArrowLeft, type LucideIcon } from 'lucide-react';
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
  const rightActionSlot = props.rightSlot ?? (props.rightAction ? <TopBarIconButton {...props.rightAction} /> : null);
  const rightSlotInBackRow = Boolean(props.onBack && (rightActionSlot || props.statusSlot));
  const hasTitleRow = Boolean(props.leftAction || (!rightSlotInBackRow && rightActionSlot) || (!props.onBack && props.statusSlot) || props.title);
  const hasChrome = Boolean(props.onBack || hasTitleRow);
  if (!props.visible || !hasChrome) {
    return null;
  }

  return (
    <header className="sticky top-0 z-surface -mx-6 bg-companion-base/95 px-6 pb-3 pt-4 backdrop-blur sm:-mx-7 sm:px-7">
      {props.onBack ? (
        <div className={`flex min-h-10 items-center justify-between gap-3 ${hasTitleRow ? 'mb-3' : ''}`}>
          <button
            aria-label={props.backLabel ?? 'Back'}
            className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-companion-text-secondary transition hover:text-foreground"
            onClick={props.onBack}
            type="button"
          >
            <ArrowLeft className="h-6 w-6 shrink-0" />
          </button>
          {rightSlotInBackRow ? (
            <div className="flex shrink-0 items-center gap-1">
              {props.statusSlot}
              {rightActionSlot}
            </div>
          ) : null}
        </div>
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
            {rightSlotInBackRow ? null : props.statusSlot}
            {rightSlotInBackRow ? null : rightActionSlot}
          </div>
        </div>
      ) : null}
    </header>
  );
}

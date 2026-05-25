import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { definedProps } from '../shared/lib/definedProps';

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

function TopBarBackRow(props: {
  backLabel?: string;
  hasTitleRow: boolean;
  onBack(): void;
  rightSlot?: ReactNode;
}) {
  return (
    <div className={`flex min-h-10 items-center justify-between gap-3 ${props.hasTitleRow ? 'mb-3' : ''}`}>
      <button aria-label={props.backLabel ?? 'Back'} className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-companion-text-secondary transition hover:text-foreground" onClick={props.onBack} type="button">
        <ArrowLeft className="h-6 w-6 shrink-0" />
      </button>
      {props.rightSlot ? <div className="flex shrink-0 items-center gap-1">{props.rightSlot}</div> : null}
    </div>
  );
}

function useScrollElevation() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const scroller = header.closest('[data-testid="companion-scroll-container"]');
    if (!scroller) return;
    const update = () => { header.dataset.elevated = String(scroller.scrollTop > 4); };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);
  return ref;
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
  const headerRef = useScrollElevation();

  const rightActionSlot = props.rightSlot ?? (props.rightAction ? <TopBarIconButton {...props.rightAction} /> : null);
  const rightSlotInBackRow = Boolean(props.onBack && (rightActionSlot || props.statusSlot));
  const hasTitleRow = Boolean(props.leftAction || (!rightSlotInBackRow && rightActionSlot) || (!props.onBack && props.statusSlot) || props.title);
  const hasChrome = Boolean(props.onBack || hasTitleRow);
  if (!props.visible || !hasChrome) {
    return null;
  }

  return (
    <header
      className="sticky top-0 z-surface -mx-6 bg-companion-base/95 px-6 pb-3 pt-[max(env(safe-area-inset-top),16px)] backdrop-blur data-[elevated=true]:border-b data-[elevated=true]:border-companion-divider sm:-mx-7 sm:px-7"
      data-elevated="false"
      ref={headerRef}
    >
      {props.onBack ? (
        <TopBarBackRow
          hasTitleRow={hasTitleRow}
          onBack={props.onBack}
          {...definedProps({
            backLabel: props.backLabel,
            rightSlot: rightSlotInBackRow ? <>{props.statusSlot}{rightActionSlot}</> : undefined
          })}
        />
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

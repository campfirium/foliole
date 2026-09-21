import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { companionMobileChromeHitRailClassName, companionMobileRailBleedClassName } from './companionCssCompatibility';

type TopBarAction = {
  icon: LucideIcon;
  label: string;
  onClick(): void;
};

function TopBarIconButton(props: TopBarAction & { testId?: string }) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-companion-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
      data-testid={props.testId}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function CompanionTopBar(props: {
  backLabel?: string;
  density?: 'compact' | 'normal';
  leftAction?: TopBarAction;
  onBack?: () => void;
  rightAction?: TopBarAction;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
  title?: string;
  visible: boolean;
}) {
  const t = useTranslation();
  const hasChrome = Boolean(props.onBack || props.leftAction || props.rightAction || props.rightSlot || props.statusSlot || props.title);
  if (!props.visible || !hasChrome) return null;
  return (
    <header className={`${companionMobileRailBleedClassName} ${companionMobileChromeHitRailClassName} sticky top-0 z-surface bg-companion-base pb-1 pt-1 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),4px)]`}>
      <div className="relative flex min-h-11 items-center justify-between">
        <div className="flex min-w-11 items-center">
          {props.onBack ? (
            <TopBarIconButton icon={ArrowLeft} label={props.backLabel ?? t('companion.back')} onClick={props.onBack} testId="companion-top-bar-back" />
          ) : props.leftAction ? (
            <TopBarIconButton {...props.leftAction} testId="companion-top-bar-left-action" />
          ) : null}
        </div>
        {props.title ? <h1 className="companion-toolbar-title">{props.title}</h1> : null}
        <div className="flex min-w-11 items-center justify-end gap-1">
          {props.statusSlot}
          {props.rightSlot ?? (props.rightAction ? <TopBarIconButton {...props.rightAction} /> : null)}
        </div>
      </div>
    </header>
  );
}

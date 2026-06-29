import { EllipsisVertical, ListTree, X, type LucideIcon } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { companionFlexRowGap2ClassName } from './companionCssCompatibility';

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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-companion-content/95 text-companion-text-secondary ring-1 ring-companion-divider transition hover:bg-companion-subtle hover:text-foreground disabled:text-companion-text-tertiary"
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
  title: string;
}) {
  const t = useTranslation();
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base/95 px-4 pb-2 pt-20 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),80px)] backdrop-blur">
        <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
          <ReadingChromeButton icon={X} label={t('companion.reading.exit')} onClick={props.onExit} />
          <ReadingChromeButton icon={ListTree} label={t('companion.reading.outline')} onClick={props.onOpenOutline} />
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
            {props.title}
          </span>
        </div>
      </div>
      <div className={`fixed right-5 bottom-6 supports-[bottom:calc(0px)]:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-workspace-overlay flex items-center ${companionFlexRowGap2ClassName}`}>
        <ReadingChromeButton icon={EllipsisVertical} label={t('companion.reading.more')} onClick={props.onOpenActions} />
      </div>
    </>
  );
}

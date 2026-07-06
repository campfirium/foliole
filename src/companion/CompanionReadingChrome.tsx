import { Check, EllipsisVertical, ListTree, Pencil, Undo2, X, type LucideIcon } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { companionFlexRowGap2ClassName } from './companionCssCompatibility';

function ReadingChromeButton(props: {
  disabled?: boolean | undefined;
  icon: LucideIcon;
  label: string;
  onClick?: (() => void) | undefined;
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
  canEditContent?: boolean;
  isContentEditing?: boolean;
  onExit(): void;
  onToggleContentEditing?: () => void;
  onOpenActions(): void;
  onOpenOutline(): void;
  title: string;
}) {
  const t = useTranslation();
  const exitLabel = props.isContentEditing ? t('companion.reading.cancelEditing') : t('companion.reading.exit');
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base/95 px-4 pb-2 pt-20 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),80px)] backdrop-blur">
        <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
          <ReadingChromeButton
            icon={props.isContentEditing ? Undo2 : X}
            label={exitLabel}
            onClick={props.isContentEditing ? props.onToggleContentEditing : props.onExit}
          />
          {props.isContentEditing ? null : (
            <ReadingChromeButton icon={ListTree} label={t('companion.reading.outline')} onClick={props.onOpenOutline} />
          )}
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
            {props.title}
          </span>
          {props.isContentEditing ? (
            <ReadingChromeButton
              icon={Check}
              label={t('companion.reading.doneEditing')}
              onClick={props.onToggleContentEditing ?? (() => undefined)}
            />
          ) : null}
        </div>
      </div>
      {props.isContentEditing ? null : (
        <div className={`fixed right-5 bottom-6 supports-[bottom:calc(0px)]:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-workspace-overlay flex items-center ${companionFlexRowGap2ClassName}`}>
          {props.canEditContent ? (
            <ReadingChromeButton
              icon={Pencil}
              label={t('companion.reading.editTopic')}
              onClick={props.onToggleContentEditing ?? (() => undefined)}
            />
          ) : null}
          <ReadingChromeButton icon={EllipsisVertical} label={t('companion.reading.more')} onClick={props.onOpenActions} />
        </div>
      )}
    </>
  );
}

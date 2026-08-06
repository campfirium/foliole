import { ChevronLeft, EllipsisVertical, ListTree, Pencil, RefreshCw, type LucideIcon } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { companionFlexRowGap2ClassName, companionMobileChromeHitRailClassName } from './companionCssCompatibility';

function ReadingChromeButton(props: {
  disabled?: boolean | undefined;
  icon: LucideIcon;
  label: string;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-companion-subtle hover:text-foreground disabled:text-companion-text-tertiary"
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ReadingChromeTextButton(props: {
  label: string;
  onClick?: (() => void) | undefined;
  primary?: boolean | undefined;
}) {
  return (
    <button
      aria-label={props.label}
      className={props.primary
        ? 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md border border-companion-divider bg-companion-content/80 px-3 text-sm font-medium text-foreground transition hover:bg-companion-subtle'
        : 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md px-3 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle hover:text-foreground'}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

function ChromeSpacer() {
  return <div aria-hidden="true" className="h-10" />;
}

function EditingChrome(props: {
  onToggleContentEditing?: (() => void) | undefined;
}) {
  const t = useTranslation();
  return (
    <div className={`fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base/95 ${companionMobileChromeHitRailClassName} pt-10 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),40px)] backdrop-blur`}>
      <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
        <ReadingChromeTextButton label={t('companion.reading.cancelEditing')} onClick={props.onToggleContentEditing} />
        <span className="min-w-0 flex-1 text-center text-sm font-semibold text-foreground">
          {t('companion.reading.editContent')}
        </span>
        <ReadingChromeTextButton label={t('companion.reading.doneEditing')} onClick={props.onToggleContentEditing} primary={true} />
      </div>
    </div>
  );
}

export function ReadingChrome(props: {
  canEditContent?: boolean;
  isContentEditing?: boolean;
  onExit(): void;
  onToggleContentEditing?: () => void;
  onOpenActions(): void;
  onOpenAlternative?: () => void;
  onOpenOutline(): void;
  title: string;
  visible?: boolean;
}) {
  const t = useTranslation();
  if (props.isContentEditing) {
    return <EditingChrome onToggleContentEditing={props.onToggleContentEditing} />;
  }
  const controlsVisible = props.visible !== false;
  return (
    <>
      <div className={`fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base/95 ${companionMobileChromeHitRailClassName} pt-10 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),40px)] backdrop-blur`}>
        <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
          {controlsVisible ? (
            <>
              <ReadingChromeButton icon={ChevronLeft} label={t('companion.reading.exit')} onClick={props.onExit} testId="companion-reading-exit" />
              <ReadingChromeButton icon={ListTree} label={t('companion.reading.outline')} onClick={props.onOpenOutline} />
              <span className="min-w-0 max-w-[52vw] flex-1 truncate pl-2 text-left text-sm font-medium text-foreground sm:max-w-sm">
                {props.title}
              </span>
              {props.onOpenAlternative ? (
                <ReadingChromeButton
                  icon={RefreshCw}
                  label={t('companion.reading.alternative.open')}
                  onClick={props.onOpenAlternative}
                />
              ) : null}
            </>
          ) : <ChromeSpacer />}
        </div>
      </div>
      <div className={`fixed inset-x-0 bottom-0 z-workspace-overlay bg-companion-base/95 ${companionMobileChromeHitRailClassName} py-2 backdrop-blur supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),8px)]`}>
        <div className={`mx-auto flex max-w-[760px] items-center justify-end ${companionFlexRowGap2ClassName}`}>
          {controlsVisible ? (
            <>
              {props.canEditContent ? (
                <ReadingChromeButton
                  icon={Pencil}
                  label={t('companion.reading.editTopic')}
                  onClick={props.onToggleContentEditing ?? (() => undefined)}
                />
              ) : null}
              <ReadingChromeButton icon={EllipsisVertical} label={t('companion.reading.more')} onClick={props.onOpenActions} />
            </>
          ) : <ChromeSpacer />}
        </div>
      </div>
    </>
  );
}

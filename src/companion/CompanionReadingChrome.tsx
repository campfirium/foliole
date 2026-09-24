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
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-companion-text-secondary transition hover:text-foreground disabled:text-companion-text-tertiary"
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
  testId?: string | undefined;
}) {
  return (
    <button
      aria-label={props.label}
      className={props.primary
        ? 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md border border-companion-divider bg-companion-content/80 px-3 text-sm font-medium text-foreground transition'
        : 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md px-3 text-sm font-medium text-companion-text-secondary transition hover:text-foreground'}
      onClick={props.onClick}
      data-testid={props.testId}
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
    <div className={`fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} pt-0 supports-[padding-top:max(0px)]:pt-[env(safe-area-inset-top)]`}>
      <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
        <ReadingChromeTextButton label={t('companion.reading.cancelEditing')} onClick={props.onToggleContentEditing} />
        <span className="min-w-0 flex-1 text-center text-[17px] font-normal text-foreground">
          {t('companion.reading.editContent')}
        </span>
        <ReadingChromeTextButton label={t('companion.reading.doneEditing')} onClick={props.onToggleContentEditing} primary={true} testId="companion-reading-edit-done" />
      </div>
    </div>
  );
}

function ReadingTopChrome(props: {
  controlsVisible: boolean;
  onExit(): void;
  onOpenAlternative?: () => void;
  onOpenOutline(): void;
  title: string;
}) {
  const t = useTranslation();
  return (
    <div className={`fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} pt-0 supports-[padding-top:max(0px)]:pt-[env(safe-area-inset-top)]`}>
      <div className="relative mx-auto flex max-w-[760px] items-center">
        {props.controlsVisible ? (
          <>
            <div className="flex items-center">
              <ReadingChromeButton icon={ChevronLeft} label={t('companion.reading.exit')} onClick={props.onExit} testId="companion-reading-exit" />
              <ReadingChromeButton icon={ListTree} label={t('companion.reading.outline')} onClick={props.onOpenOutline} />
            </div>
            <span className="pointer-events-none absolute left-1/2 w-[calc(100%-12.25rem)] max-w-[52vw] -translate-x-1/2 truncate text-center text-sm font-medium text-foreground sm:max-w-sm">
              {props.title}
            </span>
            {props.onOpenAlternative ? (
              <div className="ml-auto">
                <ReadingChromeButton
                  icon={RefreshCw}
                  label={t('companion.reading.alternative.open')}
                  onClick={props.onOpenAlternative}
                />
              </div>
            ) : null}
          </>
        ) : <ChromeSpacer />}
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
      <ReadingTopChrome
        controlsVisible={controlsVisible}
        onExit={props.onExit}
        onOpenOutline={props.onOpenOutline}
        title={props.title}
        {...(props.onOpenAlternative ? { onOpenAlternative: props.onOpenAlternative } : {})}
      />
      <div className={`fixed inset-x-0 bottom-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} py-2 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),8px)]`}>
        <div className={`mx-auto flex max-w-[760px] items-center justify-end ${companionFlexRowGap2ClassName}`}>
          {controlsVisible ? (
            <>
              {props.canEditContent ? (
                <ReadingChromeButton
                  icon={Pencil}
                  label={t('companion.reading.editTopic')}
                  onClick={props.onToggleContentEditing ?? (() => undefined)}
                  testId="companion-reading-edit"
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

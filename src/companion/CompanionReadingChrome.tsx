import { ArrowDown, ArrowUp, ChevronLeft, EllipsisVertical, ListTree, Pen, RefreshCw, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { companionFlexRowGap2ClassName, companionMobileChromeHitRailClassName } from './companionCssCompatibility';
import { useCompanionFlowHistoryControls } from './CompanionFlowHistoryContext';
import type { CompanionReadingNavigationControls } from './useCompanionReadingNavigation';
import { useCompanionTouchClick } from './useCompanionTouchClick';

function ReadingChromeButton(props: {
  disabled?: boolean | undefined;
  icon: LucideIcon;
  label: string;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
}) {
  const Icon = props.icon;
  const activation = useCompanionTouchClick(() => props.onClick?.(), { disabled: props.disabled === true });
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      aria-label={props.label}
      className="inline-flex h-11 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:text-foreground disabled:text-companion-text-tertiary"
      data-testid={props.testId}
      disabled={props.disabled}
      {...activation}
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
  const activation = useCompanionTouchClick(() => props.onClick?.());
  return (
    <button
      aria-label={props.label}
      className={props.primary
        ? 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md border border-companion-divider bg-companion-content/80 px-3 text-sm font-medium text-foreground transition'
        : 'inline-flex h-9 min-w-[56px] items-center justify-center rounded-md px-3 text-sm font-medium text-companion-text-secondary transition hover:text-foreground'}
      {...activation}
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
  onOpenActions(): void;
  onCancelContentEditing?: (() => void) | undefined;
  onToggleContentEditing?: (() => void) | undefined;
}) {
  const t = useTranslation();
  return (
    <div className={`companion-reading-top-chrome fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} pt-0 supports-[padding-top:max(0px)]:pt-[env(safe-area-inset-top)]`}>
      <div className={`mx-auto flex max-w-[760px] items-center ${companionFlexRowGap2ClassName}`}>
        <ReadingChromeTextButton label={t('companion.reading.cancelEditing')} onClick={props.onCancelContentEditing} testId="companion-reading-edit-cancel" />
        <span className="min-w-0 flex-1 text-center text-[17px] font-normal text-foreground">
          {t('companion.reading.editContent')}
        </span>
        <ReadingChromeTextButton label={t('companion.reading.doneEditing')} onClick={props.onToggleContentEditing} primary={true} testId="companion-reading-edit-done" />
        <ReadingChromeButton icon={EllipsisVertical} label={t('companion.reading.more')} onClick={props.onOpenActions} />
      </div>
    </div>
  );
}

function ReadingTopChrome(props: {
  actions?: ReactNode;
  controlsVisible: boolean;
  onExit(): void;
  onOpenAlternative?: () => void;
  onOpenOutline(): void;
  review: boolean;
  isReviewItem: boolean;
  title: string;
}) {
  const t = useTranslation();
  return (
    <div className={`companion-reading-top-chrome fixed inset-x-0 top-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} pt-0 supports-[padding-top:max(0px)]:pt-[env(safe-area-inset-top)]`}>
      <div className="relative mx-auto flex max-w-[760px] items-center">
        {props.controlsVisible ? (
          <>
            <div className="flex items-center">
              <ReadingChromeButton icon={ChevronLeft} label={t(props.review ? 'companion.review.exit' : 'companion.reading.exit')} onClick={props.onExit} testId="companion-reading-exit" />
              {props.isReviewItem ? <ItemFlowHistoryButtons /> : <ReadingChromeButton icon={ListTree} label={t('companion.reading.outline')} onClick={props.onOpenOutline} />}
            </div>
            {!props.review ? <span className="pointer-events-none absolute left-1/2 w-[calc(100%-12.25rem)] max-w-[52vw] -translate-x-1/2 truncate text-center text-sm font-medium text-foreground sm:max-w-sm">
              {props.title}
            </span> : null}
            <div className="ml-auto flex items-center">
              {props.onOpenAlternative ? (
                <div className="ml-auto">
                  <ReadingChromeButton
                    icon={RefreshCw}
                    label={t('companion.reading.alternative.open')}
                    onClick={props.onOpenAlternative}
                  />
                </div>
              ) : null}
            {props.actions}
            </div>
          </>
        ) : <ChromeSpacer />}
      </div>
    </div>
  );
}

export function ReadingChrome(props: {
  navigation?: CompanionReadingNavigationControls | undefined;
  actionsAtTop?: boolean;
  isReviewItem?: boolean;
  canEditContent?: boolean;
  isContentEditing?: boolean;
  onCancelContentEditing?: () => void;
  onExit(): void;
  onToggleContentEditing?: () => void;
  onOpenActions(): void;
  onOpenAlternative?: () => void;
  onOpenOutline(): void;
  title: string;
  visible?: boolean;
}) {
  if (props.isContentEditing) {
    return <EditingChrome onOpenActions={props.onOpenActions} onCancelContentEditing={props.onCancelContentEditing} onToggleContentEditing={props.onToggleContentEditing} />;
  }
  const controlsVisible = props.visible !== false;
  return (
    <>
      <ReadingTopChrome
        actions={<ReadingActionsControls {...props} />}
        controlsVisible={controlsVisible}
        onExit={props.onExit}
        onOpenOutline={props.onOpenOutline}
        review={props.actionsAtTop === true}
        isReviewItem={props.isReviewItem === true}
        title={props.title}
        {...(props.onOpenAlternative ? { onOpenAlternative: props.onOpenAlternative } : {})}
      />
      {!props.actionsAtTop ? <div className={`fixed inset-x-0 bottom-0 z-workspace-overlay bg-companion-base ${companionMobileChromeHitRailClassName} py-2 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),8px)]`}>
        <div className={`mx-auto flex max-w-[760px] items-center justify-end ${companionFlexRowGap2ClassName}`}>
          {controlsVisible ? <>
            {props.navigation ? <ReadingNavigationControls navigation={props.navigation} /> : null}
          </> : <ChromeSpacer />}
        </div>
      </div> : null}
    </>
  );
}

function ReadingActionsControls(props: { canEditContent?: boolean; onToggleContentEditing?: () => void; onOpenActions(): void }) {
  const t = useTranslation();
  return <>
    {props.canEditContent ? <ReadingChromeButton icon={Pen} label={t('companion.reading.editContent')}
      onClick={props.onToggleContentEditing} testId="companion-reading-edit" /> : null}
    <ReadingChromeButton icon={EllipsisVertical} label={t('companion.reading.more')} onClick={props.onOpenActions} />
  </>;
}

function ReadingNavigationControls({ navigation }: { navigation: CompanionReadingNavigationControls }) {
  const t = useTranslation();
  return <div className="flex w-full items-center justify-between">
    <ReadingChromeButton icon={ArrowUp} label={t('companion.reading.previousTopic')}
      disabled={navigation.disabled || !navigation.previous} onClick={navigation.previous} />
    <ReadingChromeButton icon={ArrowDown} label={t('companion.reading.nextTopic')}
      disabled={navigation.disabled || !navigation.next} onClick={navigation.next} />
  </div>;
}

function ItemFlowHistoryButtons() {
  const controls = useCompanionFlowHistoryControls();
  const t = useTranslation();
  if (!controls) return null;
  return <>
    {(['undo', 'redo'] as const).map(mode => <ReadingChromeButton key={mode}
      icon={mode === 'undo' ? Undo2 : Redo2} label={t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo')}
      disabled={controls.busy || controls.refreshPending || !(mode === 'undo' ? controls.canUndo : controls.canRedo)}
      onClick={() => controls.apply(mode)} />)}
  </>;
}

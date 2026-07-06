import { useEffect } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  appShelllessSurfaceClassName
} from '../../shared/ui';
import type { ReviewQueueEmptyDialogContent } from '../hooks/useReviewQueueEmptyDialogState';

export function ReviewQueueEmptyNotice(props: {
  content: ReviewQueueEmptyDialogContent | null;
  onClose: () => void;
  open: boolean;
}) {
  const t = useTranslation();
  const isOpen = props.open && props.content?.kind === 'empty';
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const timeout = window.setTimeout(props.onClose, 4200);
    return () => window.clearTimeout(timeout);
  }, [isOpen, props.onClose]);

  if (!isOpen) {
    return null;
  }
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-0 left-[calc(var(--workspace-rail-width)+var(--workspace-list-current-width,300px)+var(--workspace-list-splitter-width,1px))] right-[calc(var(--workspace-right-sidebar-current-width,320px)+var(--workspace-right-sidebar-splitter-width,1px))] top-[var(--workspace-top-toolbar-height)] z-workspace-overlay flex items-center justify-center px-6"
      data-testid="review-queue-empty-notice"
      role="status"
    >
      <div className={appShelllessSurfaceClassName('flex min-h-[52px] w-[min(300px,100%)] items-center justify-center px-[18px] py-[14px] text-center text-ui-md font-medium leading-5 text-shellless-title')}>
        {t('desktop.reviewSession.allClear.notice')}
      </div>
    </div>
  );
}

export function ReviewQueueEmptyDialog(props: {
  content: ReviewQueueEmptyDialogContent | null;
  onContinueDemoDay?: (() => void) | undefined;
  onClose: () => void;
  onExitReviewMode?: (() => void) | undefined;
  open: boolean;
}) {
  const t = useTranslation();
  const demoDayClearContent = props.content?.kind === 'demo-day-clear' ? props.content : null;
  if (!props.open || !demoDayClearContent) {
    return null;
  }
  const title = t('desktop.rightPanel.flow.demo.dayClearTitle', { day: demoDayClearContent.day });
  const description = t('desktop.rightPanel.flow.demo.dayClearDescription', { day: demoDayClearContent.day + 1 });
  return (
    <AppDialog open={props.open} onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {description}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton onClick={props.onExitReviewMode} variant="ghost">
              {t('desktop.reviewQueue.emptyDialog.exitReviewMode')}
            </AppButton>
            <AppButton onClick={props.onContinueDemoDay}>
              {t('desktop.reviewQueue.emptyDialog.continueDemoDay', { day: demoDayClearContent.day + 1 })}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

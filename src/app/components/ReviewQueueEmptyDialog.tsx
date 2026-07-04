import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import type { ReviewQueueEmptyDialogContent } from '../hooks/useReviewQueueEmptyDialogState';

export function ReviewQueueEmptyDialog(props: {
  content: ReviewQueueEmptyDialogContent | null;
  onContinueDemoDay?: (() => void) | undefined;
  onClose: () => void;
  onExitReviewMode?: (() => void) | undefined;
  open: boolean;
}) {
  const t = useTranslation();
  const demoDayClearContent = props.content?.kind === 'demo-day-clear' ? props.content : null;
  const title = demoDayClearContent
    ? t('desktop.rightPanel.flow.demo.dayClearTitle', { day: demoDayClearContent.day })
    : t('desktop.reviewSession.allClear.notice');
  const description = demoDayClearContent
    ? t('desktop.rightPanel.flow.demo.dayClearDescription', { day: demoDayClearContent.day + 1 })
    : null;
  return (
    <AppDialog open={props.open} onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{title}</AppDialogTitle>
          {description ? (
            <AppDialogDescription className="mt-2">
              {description}
            </AppDialogDescription>
          ) : null}
          {demoDayClearContent ? (
            <div className="mt-5 flex justify-end gap-2">
              <AppButton onClick={props.onExitReviewMode} variant="ghost">
                {t('desktop.reviewQueue.emptyDialog.exitReviewMode')}
              </AppButton>
              <AppButton onClick={props.onContinueDemoDay}>
                {t('desktop.reviewQueue.emptyDialog.continueDemoDay', { day: demoDayClearContent.day + 1 })}
              </AppButton>
            </div>
          ) : null}
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

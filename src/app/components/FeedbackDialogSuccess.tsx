import { CheckCircle2 } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogContent, AppDialogTitle } from '../../shared/ui';

export function FeedbackSuccessContent(props: {
  attachmentWarning: boolean;
  onClose: () => void;
}) {
  const t = useTranslation();
  return (
    <AppDialogContent className="flex w-[min(92vw,22rem)] flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70">
          <CheckCircle2 aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <AppDialogTitle>{t('feedback.success.title')}</AppDialogTitle>
          {props.attachmentWarning ? <p className="text-sm leading-5 text-foreground/70">{t('feedback.success.attachmentsSkipped')}</p> : null}
        </div>
      </div>
      <div className="flex justify-end">
        <AppButton onClick={props.onClose} variant="default">{t('feedback.done')}</AppButton>
      </div>
    </AppDialogContent>
  );
}

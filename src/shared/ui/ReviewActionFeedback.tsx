import { useTranslation } from '../localization/LocalizationProvider';

import { AppButton } from './Button';

export function ReviewActionFeedback(props: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslation();

  if (!props.errorMessage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <p aria-live="assertive" className="text-ui-sm text-error">
        {props.errorMessage}
      </p>
      {props.onRetry ? (
        <AppButton disabled={props.isSubmitting} onClick={props.onRetry} size="sm" variant="ghost">
          {t('desktop.reviewActions.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

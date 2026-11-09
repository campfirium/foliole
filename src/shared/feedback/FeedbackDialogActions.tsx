import { useTranslation } from '../localization/LocalizationProvider';
import { AppSpinner, appShelllessActionBarClassName, appShelllessControlClassName } from '../ui';

import type { SubmitState } from './FeedbackDialogParts';
import { useFeedbackUpdateNotice } from './FeedbackDialogUpdateNotice';

export function FeedbackActions(props: {
  appVersion: string;
  canSubmit: boolean;
  onCancel?: (() => void) | undefined;
  onSubmit: () => Promise<void>;
  state: SubmitState;
}) {
  const t = useTranslation();
  const showUpdateNotice = useFeedbackUpdateNotice(props.appVersion);
  return (
    <div className={appShelllessActionBarClassName(props.onCancel ? 'shrink-0' : undefined)}>
      {showUpdateNotice && !props.onCancel ? (
        <p className="mr-auto min-w-0 truncate pr-3 text-xs text-shellless-muted">
          {t('feedback.updateBeforeSubmit')}
        </p>
      ) : null}
      {props.onCancel ? <button className={appShelllessControlClassName('min-h-11')} onClick={props.onCancel} type="button">
        {t('feedback.cancel')}
      </button> : null}
      <button aria-busy={props.state === 'sending' || undefined} className={appShelllessControlClassName(`gap-2 ${props.onCancel ? 'min-h-11' : ''} ${props.state === 'sending' ? 'disabled:opacity-100' : ''}`)} disabled={!props.canSubmit} onClick={() => void props.onSubmit()} type="button">
        {props.state === 'sending' ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
        <span>{t(props.state === 'sending' ? 'feedback.sending' : 'feedback.submit')}</span>
      </button>
    </div>
  );
}

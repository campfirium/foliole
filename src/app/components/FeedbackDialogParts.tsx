import type { RefObject } from 'react';

import {
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload,
  type FeedbackSubmissionPayload
} from '../../shared/feedback/feedbackContract';
import type { AppLocale } from '../../shared/localization/appLanguage';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { resolveRuntimeUpdateTarget } from '../../shared/platform/updateTarget';
import {
  AppDialogContent,
  AppSpinner,
  appShelllessActionBarClassName,
  appShelllessControlClassName,
  appShelllessInputClassName,
  appShelllessSurfaceClassName
} from '../../shared/ui';

import { FeedbackAttachmentPicker } from './FeedbackDialogAttachments';
import { FeedbackContactFields } from './FeedbackDialogContactFields';
import { FeedbackSuccessContent } from './FeedbackDialogSuccess';
import { useFeedbackUpdateNotice } from './FeedbackDialogUpdateNotice';

type SubmitState = 'idle' | 'sending' | 'sent' | 'failed';

export interface FeedbackDraft {
  appLanguage: AppLocale;
  appVersion: string;
  attachments: FeedbackAttachmentPayload[];
  contact: string;
  isDemo: boolean;
  message: string;
}

export function FeedbackDialogContent(props: {
  attachments: FeedbackAttachmentPayload[];
  attachmentWarning: boolean;
  appVersion: string;
  canSubmit: boolean;
  contact: string;
  endpoint?: string | undefined;
  error: string;
  isTurnstileError: boolean;
  message: string;
  onAppendFiles: (files: File[]) => Promise<void>;
  onClose: () => void;
  onContactChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onPasteFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (index: number) => void;
  onSubmit: () => Promise<void>;
  state: SubmitState;
  turnstileContainerRef: RefObject<HTMLDivElement>;
  turnstileSiteKey?: string | undefined;
}) {
  if (props.state === 'sent') {
    return (
      <FeedbackSuccessContent
        attachmentWarning={props.attachmentWarning}
        onClose={props.onClose}
      />
    );
  }
  return (
    <AppDialogContent
      className={appShelllessSurfaceClassName('flex w-[min(92vw,41.25rem)] flex-col overflow-hidden p-0')}
      onPaste={(event) => {
        const files = getPastedFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void props.onPasteFiles(files);
      }}
    >
      <div className="px-[var(--app-shellless-content-inline-padding)]">
        <FeedbackTextField message={props.message} onMessageChange={props.onMessageChange} />
        <FeedbackContactFields contact={props.contact} onContactChange={props.onContactChange} />
        <FeedbackAttachmentPicker attachments={props.attachments} onAppendFiles={props.onAppendFiles} onRemoveAttachment={props.onRemoveAttachment} />
        {props.turnstileSiteKey ? <div ref={props.turnstileContainerRef} /> : null}
        <FeedbackStatus
          attachmentWarning={props.attachmentWarning}
          endpoint={props.endpoint}
          error={props.error}
          isTurnstileError={props.isTurnstileError}
          state={props.state}
        />
      </div>
      <FeedbackActions appVersion={props.appVersion} canSubmit={props.canSubmit} onSubmit={props.onSubmit} state={props.state} />
    </AppDialogContent>
  );
}

export function createFeedbackPayload(draft: FeedbackDraft, turnstileToken: string): FeedbackSubmissionPayload {
  return {
    attachments: draft.attachments,
    contact: draft.contact,
    message: draft.message,
    metadata: {
      appVersion: draft.appVersion,
      language: draft.appLanguage,
      platform: draft.isDemo ? 'demo' : resolveRuntimeUpdateTarget().platform
    },
    turnstileToken
  };
}

export function buildFeedbackContentProps(args: {
  appendFiles: (files: File[]) => Promise<void>;
  attachments: FeedbackAttachmentPayload[];
  attachmentWarning: boolean;
  appVersion: string;
  canSubmit: boolean;
  contact: string;
  endpoint: string | undefined;
  error: string;
  isTurnstileError: boolean;
  message: string;
  setContact: (value: string) => void;
  setMessage: (value: string) => void;
  removeAttachment: (index: number) => void;
  state: SubmitState;
  submit: () => Promise<void>;
  turnstileContainerRef: RefObject<HTMLDivElement>;
  turnstileSiteKey: string | undefined;
}) {
  return {
    attachments: args.attachments,
    attachmentWarning: args.attachmentWarning,
    appVersion: args.appVersion,
    canSubmit: args.canSubmit,
    contact: args.contact,
    endpoint: args.endpoint,
    error: args.error,
    isTurnstileError: args.isTurnstileError,
    message: args.message,
    onAppendFiles: args.appendFiles,
    onContactChange: args.setContact,
    onMessageChange: args.setMessage,
    onPasteFiles: args.appendFiles,
    onRemoveAttachment: args.removeAttachment,
    onSubmit: args.submit,
    state: args.state,
    turnstileContainerRef: args.turnstileContainerRef,
    turnstileSiteKey: args.turnstileSiteKey
  };
}

export function FeedbackTextField(props: {
  message: string;
  onMessageChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <textarea
      aria-label={t('feedback.message.label')}
      className={appShelllessInputClassName('min-h-40 px-0')}
      maxLength={FEEDBACK_LIMITS.messageLength}
      onChange={(event) => props.onMessageChange(event.target.value)}
      placeholder={t('feedback.message.placeholder')}
      value={props.message}
    />
  );
}

function getPastedFiles(data: DataTransfer) {
  const files = Array.from(data.files);
  if (files.length) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function FeedbackStatus(props: {
  attachmentWarning: boolean;
  endpoint?: string | undefined;
  error: string;
  isTurnstileError: boolean;
  state: SubmitState;
}) {
  const t = useTranslation();
  const error = props.error || (props.isTurnstileError ? t('feedback.error.verification') : t('feedback.error.unavailable'));
  return (
    <>
      {props.error || !props.endpoint || props.isTurnstileError ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </>
  );
}

export function FeedbackActions(props: {
  appVersion: string;
  canSubmit: boolean;
  onSubmit: () => Promise<void>;
  state: SubmitState;
}) {
  const t = useTranslation();
  const showUpdateNotice = useFeedbackUpdateNotice(props.appVersion);
  return (
    <div className={appShelllessActionBarClassName()}>
      {showUpdateNotice ? (
        <p className="mr-auto min-w-0 truncate pr-3 text-xs text-shellless-muted">
          {t('feedback.updateBeforeSubmit')}
        </p>
      ) : null}
      <button aria-busy={props.state === 'sending' || undefined} className={appShelllessControlClassName(`gap-2 ${props.state === 'sending' ? 'disabled:opacity-100' : ''}`)} disabled={!props.canSubmit} onClick={() => void props.onSubmit()} type="button">
        {props.state === 'sending' ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
        <span>{t(props.state === 'sending' ? 'feedback.sending' : 'feedback.submit')}</span>
      </button>
    </div>
  );
}

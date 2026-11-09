import { useRef, type RefObject } from 'react';

import type { AppLocale } from '../localization/appLanguage';
import { useTranslation } from '../localization/LocalizationProvider';
import { resolveRuntimeUpdateTarget } from '../platform/updateTarget';
import {
  AppDialogContent,
  AppDialogTitle,
  appShelllessInputClassName,
  appShelllessSurfaceClassName
} from '../ui';

import {
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload,
  type FeedbackSubmissionPayload
} from './feedbackContract';
import { FeedbackActions } from './FeedbackDialogActions';
import { FeedbackAttachmentPicker } from './FeedbackDialogAttachments';
import { FeedbackContactFields } from './FeedbackDialogContactFields';
import { FeedbackSuccessContent } from './FeedbackDialogSuccess';

export type SubmitState = 'idle' | 'sending' | 'sent' | 'failed';

export interface FeedbackDraft {
  appLanguage: AppLocale;
  appVersion: string;
  attachments: FeedbackAttachmentPayload[];
  contact: string;
  isDemo: boolean;
  companionPlatform?: string | undefined;
  message: string;
}

type FeedbackDialogContentProps = {
  attachments: FeedbackAttachmentPayload[];
  attachmentWarning: boolean;
  appVersion: string;
  canSubmit: boolean;
  contact: string;
  endpoint?: string | undefined;
  error: string;
  isTurnstileError: boolean;
  message: string;
  mobile: boolean;
  onAppendFiles: (files: File[]) => Promise<void>;
  onClose: () => void;
  onContactChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onPasteFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (index: number) => void;
  onSubmit: () => Promise<void>;
  state: SubmitState;
  turnstileContainerRef: RefObject<HTMLDivElement | null>;
  turnstileSiteKey?: string | undefined;
};

export function FeedbackDialogContent(props: FeedbackDialogContentProps) {
  const sourceRef = useRef<HTMLElement | null>(null);
  return (
    <AppDialogContent
      className={feedbackDialogClassName(props)}
      aria-describedby={props.mobile && props.state !== 'sent' ? 'feedback-privacy' : undefined}
      onOpenAutoFocus={() => {
        sourceRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (sourceRef.current?.isConnected && document.activeElement === document.body) {
          sourceRef.current.focus({ preventScroll: true });
        }
      }}
      onPaste={(event) => {
        if (props.state === 'sent') return;
        const files = getPastedFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void props.onPasteFiles(files);
      }}
    >
      {props.state === 'sent' ? (
        <FeedbackSuccessContent attachmentWarning={props.attachmentWarning} onClose={props.onClose} />
      ) : <FeedbackFormContent {...props} />}
    </AppDialogContent>
  );
}

function feedbackDialogClassName({ mobile, state }: FeedbackDialogContentProps) {
  const mobileHeight = mobile ? 'max-h-[82dvh]' : '';
  if (state === 'sent') {
    return `flex w-[min(92vw,22rem)] flex-col gap-4 p-5 ${mobile ? 'overflow-auto' : ''} ${mobileHeight}`;
  }
  return appShelllessSurfaceClassName(`flex w-[min(92vw,41.25rem)] flex-col overflow-hidden p-0 ${mobileHeight}`);
}

function FeedbackFormContent(props: FeedbackDialogContentProps) {
  const t = useTranslation();
  return (
    <>
      <div className={`px-[var(--app-shellless-content-inline-padding)] ${props.mobile ? 'min-h-0 overflow-y-auto pt-4' : ''}`}>
        {props.mobile ? <AppDialogTitle>{t('feedback.title')}</AppDialogTitle> : null}
        <FeedbackTextField message={props.message} onMessageChange={props.onMessageChange} />
        <FeedbackContactFields contact={props.contact} onContactChange={props.onContactChange} />
        <FeedbackAttachmentPicker attachments={props.attachments} onAppendFiles={props.onAppendFiles} onRemoveAttachment={props.onRemoveAttachment} />
        {props.turnstileSiteKey ? <div ref={props.turnstileContainerRef} /> : null}
        {props.mobile ? <p id="feedback-privacy" className="my-3 text-xs text-shellless-muted">{t('feedback.privacy')}</p> : null}
        <FeedbackStatus
          attachmentWarning={props.attachmentWarning}
          endpoint={props.endpoint}
          error={props.error}
          isTurnstileError={props.isTurnstileError}
          state={props.state}
        />
      </div>
      <FeedbackActions appVersion={props.appVersion} canSubmit={props.canSubmit}
        onCancel={props.mobile ? props.onClose : undefined} onSubmit={props.onSubmit} state={props.state} />
    </>
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
      platform: draft.isDemo ? 'demo' : (draft.companionPlatform ?? resolveRuntimeUpdateTarget().platform)
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
  mobile: boolean;
  setContact: (value: string) => void;
  setMessage: (value: string) => void;
  removeAttachment: (index: number) => void;
  state: SubmitState;
  submit: () => Promise<void>;
  turnstileContainerRef: RefObject<HTMLDivElement | null>;
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
    mobile: args.mobile,
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

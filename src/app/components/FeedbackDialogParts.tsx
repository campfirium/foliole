import type { RefObject } from 'react';

import {
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload,
  type FeedbackSubmissionPayload
} from '../../shared/feedback/feedbackContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogContent, AppDialogDescription, AppDialogTitle, AppInput } from '../../shared/ui';

import { FeedbackAttachmentPicker } from './FeedbackDialogAttachments';
import { FeedbackSuccessContent } from './FeedbackDialogSuccess';

type SubmitState = 'idle' | 'sending' | 'sent' | 'failed';

export interface FeedbackDraft {
  attachments: FeedbackAttachmentPayload[];
  contact: string;
  message: string;
  name: string;
}

export function FeedbackDialogContent(props: {
  attachments: FeedbackAttachmentPayload[];
  attachmentWarning: boolean;
  canSubmit: boolean;
  contact: string;
  endpoint?: string | undefined;
  error: string;
  isTurnstileError: boolean;
  message: string;
  name: string;
  onAppendFiles: (files: File[]) => Promise<void>;
  onClose: () => void;
  onContactChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onNameChange: (value: string) => void;
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
      className="flex w-[min(92vw,36rem)] flex-col gap-4 p-5"
      onPaste={(event) => {
        const files = getPastedFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void props.onPasteFiles(files);
      }}
    >
      <FeedbackFormHeader />
      <FeedbackTextField message={props.message} onMessageChange={props.onMessageChange} />
      <FeedbackContactFields contact={props.contact} name={props.name} onContactChange={props.onContactChange} onNameChange={props.onNameChange} />
      <FeedbackAttachmentPicker attachments={props.attachments} onAppendFiles={props.onAppendFiles} onRemoveAttachment={props.onRemoveAttachment} />
      {props.turnstileSiteKey ? <div ref={props.turnstileContainerRef} /> : null}
      <FeedbackPrivacy />
      <FeedbackStatus
        attachmentWarning={props.attachmentWarning}
        endpoint={props.endpoint}
        error={props.error}
        isTurnstileError={props.isTurnstileError}
        state={props.state}
      />
      <FeedbackActions canSubmit={props.canSubmit} onClose={props.onClose} onSubmit={props.onSubmit} state={props.state} />
    </AppDialogContent>
  );
}

function FeedbackPrivacy() {
  const t = useTranslation();
  return <p className="text-xs leading-5 text-foreground/55">{t('feedback.privacy')}</p>;
}

function FeedbackFormHeader() {
  const t = useTranslation();
  return (
    <div className="space-y-1">
      <AppDialogTitle>{t('feedback.title')}</AppDialogTitle>
      <AppDialogDescription>{t('feedback.description')}</AppDialogDescription>
    </div>
  );
}

export function createFeedbackPayload(draft: FeedbackDraft, turnstileToken: string): FeedbackSubmissionPayload {
  return {
    attachments: draft.attachments,
    contact: draft.contact,
    message: draft.message,
    metadata: {
      language: navigator.language,
      platform: 'desktop'
    },
    name: draft.name,
    turnstileToken
  };
}

export function buildFeedbackContentProps(args: {
  appendFiles: (files: File[]) => Promise<void>;
  attachments: FeedbackAttachmentPayload[];
  attachmentWarning: boolean;
  canSubmit: boolean;
  contact: string;
  endpoint: string | undefined;
  error: string;
  isTurnstileError: boolean;
  message: string;
  name: string;
  setContact: (value: string) => void;
  setMessage: (value: string) => void;
  setName: (value: string) => void;
  removeAttachment: (index: number) => void;
  state: SubmitState;
  submit: () => Promise<void>;
  turnstileContainerRef: RefObject<HTMLDivElement>;
  turnstileSiteKey: string | undefined;
}) {
  return {
    attachments: args.attachments,
    attachmentWarning: args.attachmentWarning,
    canSubmit: args.canSubmit,
    contact: args.contact,
    endpoint: args.endpoint,
    error: args.error,
    isTurnstileError: args.isTurnstileError,
    message: args.message,
    name: args.name,
    onAppendFiles: args.appendFiles,
    onContactChange: args.setContact,
    onMessageChange: args.setMessage,
    onNameChange: args.setName,
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
      className="min-h-32 resize-none rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-base text-foreground outline-none placeholder:text-foreground/45 focus-visible:ring-1 focus-visible:ring-ring"
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

export function FeedbackContactFields(props: {
  contact: string;
  name: string;
  onContactChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <AppInput aria-label={t('feedback.name.label')} onChange={(event) => props.onNameChange(event.target.value)} placeholder={t('feedback.name.placeholder')} value={props.name} />
      <AppInput aria-label={t('feedback.contact.label')} onChange={(event) => props.onContactChange(event.target.value)} placeholder={t('feedback.contact.placeholder')} value={props.contact} />
    </div>
  );
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
      {props.error || !props.endpoint || props.isTurnstileError ? <p className="text-sm text-red-700">{error}</p> : null}
    </>
  );
}

export function FeedbackActions(props: {
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  state: SubmitState;
}) {
  const t = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <AppButton onClick={props.onClose} variant="ghost">{t('feedback.cancel')}</AppButton>
      <AppButton disabled={!props.canSubmit} onClick={() => void props.onSubmit()} variant="primary">
        {props.state === 'sending' ? t('feedback.sending') : t('feedback.submit')}
      </AppButton>
    </div>
  );
}

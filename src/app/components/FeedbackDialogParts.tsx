import type { RefObject } from 'react';

import {
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload,
  type FeedbackSubmissionPayload
} from '../../shared/feedback/feedbackContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogContent, AppDialogTitle } from '../../shared/ui';

import { FeedbackAttachmentPicker } from './FeedbackDialogAttachments';
import { FeedbackContactFields } from './FeedbackDialogContactFields';
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
  const t = useTranslation();
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
      className="flex w-[min(92vw,41.25rem)] flex-col overflow-hidden p-0"
      onPaste={(event) => {
        const files = getPastedFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void props.onPasteFiles(files);
      }}
    >
      <FeedbackDialogHeader title={t('feedback.title')} />
      <div className="px-6">
        <FeedbackTextField message={props.message} onMessageChange={props.onMessageChange} />
        <FeedbackContactFields contact={props.contact} name={props.name} onContactChange={props.onContactChange} onNameChange={props.onNameChange} />
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
      <FeedbackActions canSubmit={props.canSubmit} onClose={props.onClose} onSubmit={props.onSubmit} state={props.state} />
    </AppDialogContent>
  );
}

function FeedbackDialogHeader(props: {
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-foreground/[0.08] bg-background/80 px-6 py-5">
      <AppDialogTitle>{props.title}</AppDialogTitle>
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
      className="min-h-64 w-full resize-none border-0 border-b border-foreground/[0.13] bg-transparent px-0 py-5 text-[17px] leading-7 text-foreground outline-none placeholder:text-foreground/40 focus-visible:ring-0"
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
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  state: SubmitState;
}) {
  const t = useTranslation();
  return (
    <div className="flex justify-end gap-2 border-t border-foreground/[0.08] bg-background/80 px-6 py-4">
      <AppButton onClick={props.onClose} variant="ghost">{t('feedback.cancel')}</AppButton>
      <AppButton disabled={!props.canSubmit} onClick={() => void props.onSubmit()} variant="emphasis">
        {props.state === 'sending' ? t('feedback.sending') : t('feedback.submit')}
      </AppButton>
    </div>
  );
}

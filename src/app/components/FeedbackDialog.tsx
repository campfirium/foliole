import { useCallback, useEffect, useState } from 'react';

import {
  FEEDBACK_IMAGE_TYPES,
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload
} from '../../shared/feedback/feedbackContract';
import { useLocalization, useTranslation } from '../../shared/localization/LocalizationProvider';
import { useAppVersion } from '../../shared/platform/appVersion';
import { onWindowEscape } from '../../shared/platform/keyboard';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import {
  AppDialog,
  AppDialogOverlay,
  AppDialogPortal
} from '../../shared/ui';

import {
  buildFeedbackContentProps,
  createFeedbackPayload,
  FeedbackDialogContent
} from './FeedbackDialogParts';
import { useTurnstileToken } from './FeedbackDialogTurnstile';

interface FeedbackDialogProps {
  endpoint?: string | undefined;
  onClose: () => void;
  open: boolean;
  turnstileSiteKey?: string | undefined;
}

type SubmitState = 'idle' | 'sending' | 'sent' | 'failed';

interface FeedbackSubmitResponse {
  attachmentsAccepted?: boolean;
  ok?: boolean;
  warning?: string;
}

async function fileToPayload(file: File): Promise<FeedbackAttachmentPayload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    contentBase64: window.btoa(binary),
    name: file.name,
    size: file.size,
    type: file.type
  };
}

function validateFile(file: File) {
  if (!FEEDBACK_IMAGE_TYPES.includes(file.type as never)) {
    return 'type';
  }
  if (file.size > FEEDBACK_LIMITS.attachmentSizeBytes) {
    return 'size';
  }
  return null;
}

export function FeedbackDialog({ endpoint, onClose, open, turnstileSiteKey }: FeedbackDialogProps) {
  const controller = useFeedbackDialogController({ endpoint, open, turnstileSiteKey });
  useEffect(() => {
    if (!open) return undefined;
    return onWindowEscape(() => {
      onClose();
      return true;
    });
  }, [onClose, open]);
  return (
    <AppDialog onOpenChange={(nextOpen) => (nextOpen ? undefined : onClose())} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <FeedbackDialogContent
          {...controller.contentProps}
          onClose={onClose}
        />
      </AppDialogPortal>
    </AppDialog>
  );
}

function useFeedbackDialogController({
  endpoint,
  open,
  turnstileSiteKey
}: Pick<FeedbackDialogProps, 'endpoint' | 'open' | 'turnstileSiteKey'>) {
  const attachmentState = useFeedbackAttachmentState();
  const [attachmentWarning, setAttachmentWarning] = useState(false);
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const appVersion = useAppVersion();
  const { locale } = useLocalization();
  const { isDemo } = useDemoRuntimeState();
  const turnstile = useTurnstileToken(turnstileSiteKey);
  const canSubmit = Boolean(endpoint && message.trim()) && state !== 'sending' && (!turnstileSiteKey || Boolean(turnstile.token));
  const submit = useFeedbackSubmitAction({
    draft: { appLanguage: locale, appVersion, attachments: attachmentState.attachments, contact, isDemo, message },
    endpoint,
    setError,
    setAttachmentWarning,
    setState,
    turnstileToken: turnstile.token
  });

  useEffect(() => {
    if (!open) return;
    attachmentState.clearAttachments();
    setAttachmentWarning(false);
    setContact('');
    setError('');
    setMessage('');
    setState('idle');
  }, [attachmentState.clearAttachments, open]);

  return {
    contentProps: buildFeedbackContentProps({
      attachments: attachmentState.attachments,
      canSubmit,
      contact,
      endpoint,
      error,
      attachmentWarning,
      appVersion,
      message,
      setContact,
      setMessage,
      state,
      submit,
      turnstileContainerRef: turnstile.containerRef,
      turnstileSiteKey,
      appendFiles: (files) => attachmentState.appendFiles(files, setError),
      removeAttachment: attachmentState.removeAttachment,
      isTurnstileError: turnstile.error
    })
  };
}

function useFeedbackAttachmentState() {
  const t = useTranslation();
  const [attachments, setAttachments] = useState<FeedbackAttachmentPayload[]>([]);
  const clearAttachments = useCallback(function clearAttachments() {
    setAttachments([]);
  }, []);
  const appendFiles = useCallback(async function appendFiles(files: File[], setError: (value: string) => void) {
    const slots = FEEDBACK_LIMITS.attachmentCount - attachments.length;
    const selected = files.slice(0, slots);
    const invalid = selected.find(validateFile);
    if (invalid) {
      setError(t('feedback.error.attachments'));
      return;
    }
    const nextAttachments = await Promise.all(selected.map(fileToPayload));
    if (files.length > slots) {
      setAttachments([...attachments, ...nextAttachments]);
      setError(nextAttachments.length
        ? t('feedback.error.tooManyImages', { count: nextAttachments.length })
        : t('feedback.error.imageLimitReached'));
      return;
    }
    setAttachments([...attachments, ...nextAttachments]);
    setError('');
  }, [attachments, t]);
  const removeAttachment = useCallback(function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);
  return { appendFiles, attachments, clearAttachments, removeAttachment };
}

function useFeedbackSubmitAction(args: {
  draft: Parameters<typeof createFeedbackPayload>[0];
  endpoint: string | undefined;
  setAttachmentWarning: (value: boolean) => void;
  setError: (value: string) => void;
  setState: (value: SubmitState) => void;
  turnstileToken: string;
}) {
  const t = useTranslation();
  return async function submit() {
    if (!args.endpoint) {
      args.setError(t('feedback.error.unavailable'));
      return;
    }
    args.setState('sending');
    args.setAttachmentWarning(false);
    try {
      const response = await fetch(args.endpoint, {
        body: JSON.stringify(createFeedbackPayload(args.draft, args.turnstileToken)),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Feedback failed: ${response.status}`);
      }
      const body = await readFeedbackSubmitResponse(response);
      args.setAttachmentWarning(body?.attachmentsAccepted === false && body.warning === 'attachments_budget_exceeded');
      args.setState('sent');
      args.setError('');
    } catch {
      args.setState('failed');
      args.setError(t('feedback.error.failed'));
    }
  };
}

async function readFeedbackSubmitResponse(response: Response): Promise<FeedbackSubmitResponse | null> {
  try {
    return await response.json() as FeedbackSubmitResponse;
  } catch {
    return null;
  }
}

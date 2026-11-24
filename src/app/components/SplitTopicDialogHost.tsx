import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { buildSplitTopicPreview } from '../../../lib/core/nodes/splitTopicModel';
import type { NativeSplitTopicPreview } from '../../../lib/platform/nativeNodeMutationContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadSplitTopicPreferences } from '../../shared/platform/desktop/splitTopicPreferences';
import { loadSplitTopicWorkspacePreview } from '../../shared/platform/workspaceRuntimeRepository';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { recordSplitTopicTrace } from '../splitTopicTrace';

import { confirmSplitTopic } from './SplitTopicDialogMutation';
import { DEFAULT_SPLIT_TOPIC_FORM, SplitTopicControls, SplitTopicPreviewList, type SplitTopicFormState } from './SplitTopicDialogParts';
import { readSplitTopicDialogRequest, SPLIT_TOPIC_DIALOG_REQUEST_EVENT, type SplitTopicDialogRequest } from './SplitTopicDialogRequest';

type Busy = 'idle' | 'loading' | 'splitting';

function useDialogRequest() {
  const [request, setRequest] = useState<SplitTopicDialogRequest | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const next = readSplitTopicDialogRequest(event);
      if (next) setRequest(next);
    };
    window.addEventListener(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, receive);
    return () => window.removeEventListener(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, receive);
  }, []);
  return { request, setRequest };
}

function useSplitTopicDialogTrace(args: {
  request: SplitTopicDialogRequest | null;
  previewLoaded: boolean;
  content: string | undefined;
  delimiter: string;
  parts: number;
}) {
  const { request, previewLoaded, content, delimiter, parts } = args;
  const hasSource = content !== undefined;
  const openedFor = useRef<SplitTopicDialogRequest | null>(null);
  useEffect(() => {
    if (!request?.trace || !previewLoaded || openedFor.current === request) return;
    openedFor.current = request;
    recordSplitTopicTrace(request.trace, {
      event: 'split.topic.stage', stage: hasSource ? 'dialog-opened' : 'source-unavailable'
    });
  }, [request, previewLoaded, hasSource]);

  useEffect(() => {
    if (!request?.trace || !previewLoaded || content === undefined) return;
    recordSplitTopicTrace(request.trace, {
      event: 'split.topic.preview', parts,
      delimiter: !delimiter ? 'empty' : content.includes(delimiter) ? 'matched' : 'unmatched'
    });
  }, [request, previewLoaded, content, delimiter, parts]);
}

const SplitTopicDialogSurface = forwardRef<HTMLDivElement, {
  busy: Busy;
  close: () => void;
  confirm: () => Promise<void>;
  error: string | null;
  form: SplitTopicFormState;
  preview: ReturnType<typeof buildSplitTopicPreview>;
  setForm: (form: SplitTopicFormState) => void;
}>(function SplitTopicDialogSurface(props, ref) {
  const t = useTranslation();
  return (
    <AppDialogContent ref={ref} aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden" layout="task">
      <AppDialogTitle>{t('desktop.splitTopic.title')}</AppDialogTitle>
      <AppDialogBody className="grid min-h-0 flex-1 grid-cols-2 gap-dialog-column-gap overflow-hidden">
        <section className="app-scrollbar overflow-auto">
          <SplitTopicControls form={props.form} onChange={props.setForm} />
        </section>
        <section className="min-h-0">
          <SplitTopicPreviewList delimiter={props.form.delimiter} parts={props.preview} />
        </section>
      </AppDialogBody>
      {props.error ? <p className="mt-2 text-ui-md text-destructive" role="alert">{props.error}</p> : null}
      <AppDialogActions>
        <AppButton disabled={props.busy !== 'idle'} onClick={props.close} variant="subtle">{t('common.cancel')}</AppButton>
        <AppButton disabled={props.busy !== 'idle' || !props.form.delimiter || props.preview.length === 0} loading={props.busy === 'splitting'} loadingLabel={t('desktop.splitTopic.splitting')} onClick={() => void props.confirm()}>{t('desktop.splitTopic.confirm')}</AppButton>
      </AppDialogActions>
    </AppDialogContent>
  );
});

function useSplitTopicForm(request: SplitTopicDialogRequest | null) {
  const [form, setForm] = useState<SplitTopicFormState>(DEFAULT_SPLIT_TOPIC_FORM);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<{
    request: SplitTopicDialogRequest;
    source: NativeSplitTopicPreview | null;
  } | null>(null);

  useEffect(() => {
    setPreviewFor(null);
    if (!request) return;
    let active = true;
    setForm(DEFAULT_SPLIT_TOPIC_FORM);
    setError(null);
    setBusy('loading');
    void Promise.allSettled([loadSplitTopicPreferences(), loadSplitTopicWorkspacePreview(request.sourceNodeId)])
      .then(([preferences, source]) => {
        if (!active) return;
        if (preferences.status === 'fulfilled') {
          setForm({ ...DEFAULT_SPLIT_TOPIC_FORM, ...preferences.value });
        } else {
          recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'preferences-load-failed' });
        }
        setPreviewFor(source.status === 'fulfilled' ? { request, source: source.value } : null);
        setBusy('idle');
      });
    return () => { active = false; };
  }, [request]);

  return { form, setForm, busy, setBusy, error, setError, setPreviewFor, current: previewFor?.request === request ? previewFor : null };
}

export function SplitTopicDialogHost() {
  const t = useTranslation();
  const { request, setRequest } = useDialogRequest();
  const { form, setForm, busy, setBusy, error, setError, setPreviewFor, current } = useSplitTopicForm(request);
  const content = current?.source?.content;
  const { delimiter, footerText, headerText, keepDelimiter } = form;
  const preview = useMemo(() => content !== undefined && delimiter
    ? buildSplitTopicPreview({ content, delimiter, footerText, headerText, keepDelimiter })
    : [], [content, delimiter, footerText, headerText, keepDelimiter]);
  useSplitTopicDialogTrace({
    request, previewLoaded: current !== null, content, delimiter, parts: preview.length
  });

  if (!request) return null;
  const loadError = busy === 'idle' && !current?.source
    ? t(current ? 'desktop.splitTopic.sourceUnavailable' : 'desktop.splitTopic.failed')
    : null;
  const close = () => {
    if (busy !== 'idle') return;
    recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'canceled' });
    setRequest(null);
  };
  const confirm = async () => {
    if (busy !== 'idle' || !current?.source || preview.length === 0) return;
    recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'confirmed' });
    setBusy('splitting');
    setError(null);
    try {
      const preferencesSaved = await confirmSplitTopic({ form, preview, source: current.source, sourceNodeId: request.sourceNodeId });
      if (typeof preferencesSaved !== 'boolean') {
        recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'confirm-failed' });
        setPreviewFor({ request, source: preferencesSaved.preview });
        if (preferencesSaved.preview) setError(t('desktop.splitTopic.sourceChanged'));
        return;
      }
      recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'saved' });
      if (!preferencesSaved) {
        recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'preferences-save-failed' });
      }
      setRequest(null);
      showAppRuntimeNotice(t(preferencesSaved ? 'desktop.splitTopic.complete' : 'desktop.splitTopic.preferencesFailed'), preferencesSaved ? 'success' : 'error');
    } catch (caught) {
      recordSplitTopicTrace(request.trace, { event: 'split.topic.stage', stage: 'confirm-failed' });
      const message = caught instanceof Error ? caught.message : t('desktop.splitTopic.failed');
      setError(message);
    } finally {
      setBusy('idle');
    }
  };

  return (
    <AppDialog open onOpenChange={(open) => !open && close()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <SplitTopicDialogSurface busy={busy} close={close} confirm={confirm} error={error ?? loadError} form={form} preview={preview} setForm={setForm} />
      </AppDialogPortal>
    </AppDialog>
  );
}

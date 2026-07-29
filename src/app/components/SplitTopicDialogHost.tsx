import { forwardRef, useEffect, useMemo, useState } from 'react';

import { buildSplitTopicPreview } from '../../../lib/core/nodes/splitTopicModel';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadSplitTopicPreferences } from '../../shared/platform/desktop/splitTopicPreferences';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

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

function readSource(request: SplitTopicDialogRequest | null) {
  if (!request) return null;
  const state = useWorkspaceStore.getState();
  const source = state.nodesById[request.sourceNodeId];
  if (!source || source.kind !== 'topic' || state.trashedNodeIds.includes(source.id)) return null;
  return { source, state };
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

export function SplitTopicDialogHost() {
  const t = useTranslation();
  const { request, setRequest } = useDialogRequest();
  const [form, setForm] = useState<SplitTopicFormState>(DEFAULT_SPLIT_TOPIC_FORM);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  const sourceContext = readSource(request);
  const preview = useMemo(() => sourceContext && form.delimiter ? buildSplitTopicPreview({ content: sourceContext.source.content, delimiter: form.delimiter, footerText: form.footerText, headerText: form.headerText, keepDelimiter: form.keepDelimiter }) : [], [form, sourceContext]);

  useEffect(() => {
    if (!request) return;
    let active = true;
    setForm(DEFAULT_SPLIT_TOPIC_FORM);
    setError(null);
    setBusy('loading');
    void loadSplitTopicPreferences()
      .then((preferences) => active && setForm({ ...DEFAULT_SPLIT_TOPIC_FORM, ...preferences }))
      .catch(() => undefined)
      .finally(() => active && setBusy('idle'));
    return () => { active = false; };
  }, [request]);

  if (!request || !sourceContext) return null;
  const close = () => busy === 'idle' && setRequest(null);
  const confirm = async () => {
    if (preview.length === 0) return;
    setBusy('splitting');
    setError(null);
    try {
      const preferencesSaved = await confirmSplitTopic({ form, preview, ...sourceContext });
      setRequest(null);
      showAppRuntimeNotice(t(preferencesSaved ? 'desktop.splitTopic.complete' : 'desktop.splitTopic.preferencesFailed'), preferencesSaved ? 'success' : 'error');
    } catch (caught) {
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
        <SplitTopicDialogSurface busy={busy} close={close} confirm={confirm} error={error} form={form} preview={preview} setForm={setForm} />
      </AppDialogPortal>
    </AppDialog>
  );
}

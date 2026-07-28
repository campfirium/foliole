import { useEffect, useMemo, useState } from 'react';

import { buildSplitTopicPreview } from '../../../lib/core/nodes/splitTopicModel';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadSplitTopicPreferences } from '../../shared/platform/splitTopicPreferences';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
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
        <AppDialogContent aria-describedby={undefined} className="flex max-h-[min(780px,calc(100vh-32px))] w-[min(920px,calc(100vw-32px))] flex-col p-6">
          <AppDialogTitle>{t('desktop.splitTopic.title')}</AppDialogTitle>
          <div className="mt-5 grid min-h-0 gap-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <SplitTopicControls form={form} onChange={setForm} />
            <SplitTopicPreviewList delimiter={form.delimiter} parts={preview} />
          </div>
          {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={busy !== 'idle'} onClick={close} variant="subtle">{t('common.cancel')}</AppButton>
            <AppButton disabled={busy !== 'idle' || !form.delimiter || preview.length === 0} loading={busy === 'splitting'} loadingLabel={t('desktop.splitTopic.splitting')} onClick={() => void confirm()}>{t('desktop.splitTopic.confirm')}</AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

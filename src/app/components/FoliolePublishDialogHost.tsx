import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

import { normalizeFolioleWebFields } from '../../../lib/core/foliolePublish/folioleWebPublishFrontmatter';
import type { NativeFoliolePublishField } from '../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  forgetFoliolePublishFieldFromRuntime,
  isFoliolePublishConfigured,
  previewFoliolePublishFromRuntime,
  publishTopicToFoliole,
  resetFoliolePublishFieldHistoryFromRuntime
} from '../../shared/platform/foliolePublishRepository';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, requestAppConfirmation } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { buildFolioleFieldChoices, readFoliolePublishForm } from './foliolePublishDialogModel';
import { FOLIOLE_PUBLISH_DIALOG_REQUEST_EVENT, readFoliolePublishDialogRequest, type FoliolePublishDialogRequest } from './foliolePublishDialogRequest';
import { FoliolePublishFields } from './FoliolePublishFields';

type Busy = 'idle' | 'previewing' | 'publishing';

async function executePublishAction(input: {
  fields: NativeFoliolePublishField[];
  kind: 'preview' | 'publish';
  request: FoliolePublishDialogRequest;
  t: ReturnType<typeof useTranslation>;
}) {
  const args = { content: input.request.content, fields: normalizeFolioleWebFields(input.fields), node_id: input.request.nodeId, title: input.request.title };
  const result = input.kind === 'preview' ? await previewFoliolePublishFromRuntime(args) : await publishTopicToFoliole(args);
  if (input.kind === 'preview') return null;
  if (!result.updated_content) throw new Error(input.t('desktop.foliolePublish.localSaveError'));
  const saved = await useWorkspaceStore.getState().updateNodeContent(input.request.nodeId, result.updated_content);
  if (!saved) throw new Error(input.t('desktop.foliolePublish.localSaveError'));
  return result.status;
}

async function resetFieldHistory(input: {
  request: FoliolePublishDialogRequest;
  setError: (message: string | null) => void;
  setRequest: (request: FoliolePublishDialogRequest) => void;
  t: ReturnType<typeof useTranslation>;
}) {
  const confirmed = await requestAppConfirmation({ cancelLabel: input.t('common.cancel'), confirmLabel: input.t('desktop.foliolePublish.resetHistory'), description: input.t('desktop.foliolePublish.resetHistoryConfirm'), title: input.t('desktop.foliolePublish.resetHistory') });
  if (!confirmed) return;
  try { input.setRequest({ ...input.request, settings: await resetFoliolePublishFieldHistoryFromRuntime() }); }
  catch (caught) { input.setError(caught instanceof Error ? caught.message : 'Field history reset failed.'); }
}

function useFolioleDialogRequest() {
  const [request, setRequest] = useState<FoliolePublishDialogRequest | null>(null);
  const [fields, setFields] = useState<NativeFoliolePublishField[]>([]);
  useEffect(() => {
    const receive = (event: Event) => {
      const next = readFoliolePublishDialogRequest(event);
      if (!next) return;
      setRequest(next);
      setFields(readFoliolePublishForm(next.content));
    };
    window.addEventListener(FOLIOLE_PUBLISH_DIALOG_REQUEST_EVENT, receive);
    return () => window.removeEventListener(FOLIOLE_PUBLISH_DIALOG_REQUEST_EVENT, receive);
  }, []);
  return { fields, request, setFields, setRequest };
}

export function FoliolePublishDialogHost() {
  const t = useTranslation();
  const { fields, request, setFields, setRequest } = useFolioleDialogRequest();
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [request]);
  const choices = useMemo(() => request ? buildFolioleFieldChoices(request.content, request.settings) : [], [request]);
  if (!request) return null;
  const configured = isFoliolePublishConfigured(request.settings);
  const run = async (kind: 'preview' | 'publish') => {
    setBusy(kind === 'preview' ? 'previewing' : 'publishing');
    setError(null);
    try {
      const status = await executePublishAction({ fields, kind, request, t });
      if (!status) return;
      setRequest(null);
      const noticeKey = status === 'deployed_history_failed'
        ? 'desktop.foliolePublish.historyWarning'
        : status === 'deployed_local_publish_state_failed'
          ? 'desktop.foliolePublish.localStateWarning'
          : 'desktop.foliolePublish.published';
      showAppRuntimeNotice(t(noticeKey), status === 'deployed_and_committed' ? 'success' : 'error');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Foliole Publish failed.');
    } finally { setBusy('idle'); }
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || !configured || busy !== 'idle') return;
    event.preventDefault();
    void run('publish');
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && busy === 'idle' && setRequest(null)}>
      <AppDialogPortal><AppDialogOverlay /><AppDialogContent aria-describedby={undefined} className="w-[min(960px,calc(100vw-32px))] p-6" onKeyDownCapture={keyDown}>
        <AppDialogTitle>{t('desktop.foliolePublish.title')}</AppDialogTitle>
        <FoliolePublishFields
          choices={choices}
          fields={fields}
          historyKeys={new Set(request.settings.field_catalog.map((entry) => entry.key))}
          onChange={setFields}
          onForget={(key) => void forgetFoliolePublishFieldFromRuntime(key).then((settings) => setRequest({ ...request, settings })).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not forget this field.'))}
          onResetHistory={() => void resetFieldHistory({ request, setError, setRequest, t })}
        />
        {!configured ? <p className="mt-3 text-sm text-foreground/60">{t('desktop.foliolePublish.hostingRequired')}</p> : null}
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <AppButton disabled={busy !== 'idle'} onClick={() => setRequest(null)} variant="subtle">{t('common.cancel')}</AppButton>
          <AppButton disabled={busy === 'publishing'} loading={busy === 'previewing'} onClick={() => void run('preview')} variant="subtle">{t('desktop.foliolePublish.preview')}</AppButton>
          <AppButton disabled={!configured || busy === 'previewing'} loading={busy === 'publishing'} onClick={() => void run('publish')}>{t('desktop.foliolePublish.publish')}</AppButton>
        </div>
      </AppDialogContent></AppDialogPortal>
    </AppDialog>
  );
}

import { useEffect, useState } from 'react';

import type { NativeWordPressPostStatus } from '../../../lib/platform/nativeWordPressPublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { publishTopicToWordPress } from '../../shared/platform/wordpressPublishRepository';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  settingsFieldClassName
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { readWordPressPublishDetails } from './wordpressPublishDialogModel';
import {
  readWordPressPublishDialogRequest,
  WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT,
  type WordPressPublishDialogRequest
} from './wordpressPublishDialogRequest';

type PublishState = 'idle' | 'publishing';

function useWordPressPublishDialogRequest() {
  const [request, setRequest] = useState<WordPressPublishDialogRequest | null>(null);
  const [status, setStatus] = useState<NativeWordPressPostStatus>('draft');
  useEffect(() => {
    const handleRequest = (event: Event) => {
      const next = readWordPressPublishDialogRequest(event);
      if (!next) return;
      setRequest(next);
      setStatus('draft');
    };
    window.addEventListener(WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
  }, []);
  return { request, setRequest, setStatus, status };
}

function DialogField(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{props.label}</p>
      <p className="mt-1 break-all text-sm text-muted-foreground">{props.value}</p>
    </div>
  );
}

function useWordPressPublishAction(args: {
  details: ReturnType<typeof readWordPressPublishDetails> | null;
  onComplete: () => void;
  request: WordPressPublishDialogRequest | null;
  status: NativeWordPressPostStatus;
}) {
  const t = useTranslation();
  const [state, setState] = useState<PublishState>('idle');
  const [error, setError] = useState<string | null>(null);
  const publish = async () => {
    if (!args.request || !args.details || args.details.parseError) return;
    setState('publishing');
    setError(null);
    try {
      const result = await publishTopicToWordPress({
        content: args.request.content, status: args.status, title: args.details.title
      });
      const saved = await useWorkspaceStore.getState().updateNodeContent(args.request.nodeId, result.updated_content);
      if (!saved) throw new Error(t('desktop.wordpressPublish.error.localSave'));
      args.onComplete();
      showAppRuntimeNotice(t(result.mode === 'created'
        ? 'desktop.wordpressPublish.created'
        : 'desktop.wordpressPublish.updated'), 'success');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('desktop.wordpressPublish.error.publish'));
    } finally {
      setState('idle');
    }
  };
  return { clearError: () => setError(null), error, publish: () => void publish(), state };
}

export function WordPressPublishDialogHost() {
  const t = useTranslation();
  const { request, setRequest, setStatus, status } = useWordPressPublishDialogRequest();
  const details = request ? readWordPressPublishDetails(request.content, request.title) : null;
  const action = useWordPressPublishAction({ details, onComplete: () => setRequest(null), request, status });
  if (!request || !details) return null;
  const close = () => {
    action.clearError();
    setRequest(null);
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && action.state === 'idle' && close()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-32px))] p-6">
          <AppDialogTitle>{t('desktop.wordpressPublish.dialogTitle')}</AppDialogTitle>
          <div className="mt-5 space-y-4">
            <DialogField label={t('desktop.wordpressPublish.postTitle')} value={details.title} />
            <DialogField label={t('desktop.wordpressPublish.target')} value={request.targetSiteUrl} />
            <DialogField label={t('desktop.wordpressPublish.mode')} value={t(details.mode === 'create' ? 'desktop.wordpressPublish.mode.create' : 'desktop.wordpressPublish.mode.update')} />
            <label className="block text-sm font-medium text-foreground">
              {t('desktop.wordpressPublish.status')}
              <select aria-label={t('desktop.wordpressPublish.status')} className={`${settingsFieldClassName()} mt-1`} disabled={action.state !== 'idle'} onChange={(event) => setStatus(event.target.value as NativeWordPressPostStatus)} value={status}>
                <option value="draft">{t('desktop.wordpressPublish.status.draft')}</option>
                <option value="publish">{t('desktop.wordpressPublish.status.publish')}</option>
              </select>
            </label>
          </div>
          {details.parseError ? <p className="mt-3 text-sm text-destructive" role="alert">{details.parseError}</p> : null}
          {action.error ? <p className="mt-3 text-sm text-destructive" role="alert">{action.error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={action.state !== 'idle'} onClick={close} variant="subtle">{t('common.cancel')}</AppButton>
            <AppButton disabled={action.state !== 'idle' || Boolean(details.parseError)} onClick={action.publish}>
              {action.state === 'publishing' ? t('desktop.wordpressPublish.publishing') : t('desktop.wordpressPublish.confirm')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

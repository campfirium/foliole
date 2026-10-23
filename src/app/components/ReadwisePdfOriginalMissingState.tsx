import { useEffect, useState } from 'react';

import type { NativeReadwisePdfOriginalActionState } from '../../../lib/platform/nativeReadwiseContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from '../../shared/platform/import/readwiseOriginalFileLoadedEvent';
import { getRuntimeReadwisePdfOriginal, loadRuntimeReadwisePdfOriginalActionState } from '../../shared/platform/import/readwisePdfOriginalRuntimeRepository';
import { AppButton, AppEmptyState } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

type ActionStatus = NativeReadwisePdfOriginalActionState['status'];

export function ReadwisePdfOriginalMissingState(props: { nodeId: string; unavailable: boolean }) {
  const t = useTranslation();
  const [status, setStatus] = useState<ActionStatus | null>(null);
  useEffect(() => {
    let active = true;
    setStatus(null);
    void loadRuntimeReadwisePdfOriginalActionState(props.nodeId)
      .then((next) => { if (active) setStatus(next?.status ?? null); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [props.nodeId]);

  const run = async () => {
    setStatus('running');
    const result = await getRuntimeReadwisePdfOriginal(props.nodeId).catch(() => null);
    if (result?.status === 'completed') {
      await refreshWorkspaceState('readwise-book-load');
      window.dispatchEvent(new CustomEvent(READWISE_ORIGINAL_FILE_LOADED_EVENT, { detail: { nodeId: props.nodeId } }));
      showAppRuntimeNotice(t('desktop.nodeList.readwisePdf.success'));
      return;
    }
    setStatus('ready');
    showAppRuntimeNotice(t(result?.error_code === 'original_file_not_distributed'
      ? 'desktop.nodeList.readwisePdf.missing'
      : 'desktop.nodeList.readwisePdf.failed'), 'error');
  };
  return (
    <div data-testid="pdf-document-state-readwise-original-missing">
      <AppEmptyState
        action={status && status !== 'not_applicable' ? (
          <AppButton disabled={status !== 'ready'} onClick={() => void run()}>{actionLabel(status, t)}</AppButton>
        ) : undefined}
        description={t(props.unavailable
          ? 'desktop.pdf.readwiseOriginalUnavailable.description' : 'desktop.pdf.readwiseOriginalMissing.description')}
        title={t(props.unavailable
          ? 'desktop.pdf.readwiseOriginalUnavailable.title' : 'desktop.pdf.readwiseOriginalMissing.title')}
      />
    </div>
  );
}

function actionLabel(status: ActionStatus, t: Translate) {
  if (status === 'running') return t('desktop.nodeList.readwisePdf.running');
  if (status === 'reconnect_required') return t('desktop.nodeList.readwisePdf.reconnect');
  if (status === 'source_inactive') return t('desktop.nodeList.readwisePdf.inactive');
  return t('desktop.nodeList.readwisePdf.get');
}

import { FileDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { NativeReadwisePdfOriginalActionState } from '../../../../lib/platform/nativeReadwiseContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from '../../../shared/platform/import/readwiseOriginalFileLoadedEvent';
import { getRuntimeReadwisePdfOriginal, loadRuntimeReadwisePdfOriginalActionState } from '../../../shared/platform/import/readwisePdfOriginalRuntimeRepository';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';
import { refreshWorkspaceState } from '../../../store/workspaceRefreshScheduler';

import { NodeContextMenuItem } from './nodeListContextMenuPresentation';

export function ReadwisePdfOriginalMenuItem(props: { nodeId: string | null }) {
  const t = useTranslation();
  const [state, setState] = useState<NativeReadwisePdfOriginalActionState | null>(null);
  useEffect(() => {
    let active = true;
    setState(null);
    if (props.nodeId) void loadRuntimeReadwisePdfOriginalActionState(props.nodeId)
      .then((next) => { if (active) setState(next); })
      .catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [props.nodeId]);
  if (!props.nodeId || !state || state.status === 'not_applicable') return null;
  const label = state.status === 'ready'
    ? t('desktop.nodeList.readwisePdf.get')
    : state.status === 'running'
      ? t('desktop.nodeList.readwisePdf.running')
      : state.status === 'reconnect_required'
        ? t('desktop.nodeList.readwisePdf.reconnect')
        : t('desktop.nodeList.readwisePdf.inactive');
  const run = async () => {
    if (state.status !== 'ready' || !props.nodeId) return;
    setState({ ...state, status: 'running' });
    showAppRuntimeNotice(t('desktop.nodeList.readwisePdf.running'));
    const result = await getRuntimeReadwisePdfOriginal(props.nodeId).catch(() => null);
    if (result?.status === 'completed') {
      await refreshWorkspaceState('readwise-book-load');
      window.dispatchEvent(new CustomEvent(READWISE_ORIGINAL_FILE_LOADED_EVENT, {
        detail: { nodeId: props.nodeId }
      }));
    }
    showAppRuntimeNotice(t(result?.status === 'completed'
      ? 'desktop.nodeList.readwisePdf.success'
      : result?.error_code === 'original_file_not_distributed'
        ? 'desktop.nodeList.readwisePdf.missing'
        : 'desktop.nodeList.readwisePdf.failed'), result?.status === 'completed' ? 'info' : 'error');
  };
  return <NodeContextMenuItem disabled={state.status !== 'ready'} icon={FileDown} onSelect={() => void run()}>{label}</NodeContextMenuItem>;
}

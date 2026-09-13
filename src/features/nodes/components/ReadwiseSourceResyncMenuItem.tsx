import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { NativeReadwiseSourceResyncActionState } from '../../../../lib/platform/nativeReadwiseContract';
import { useTranslation, type Translate } from '../../../shared/localization/LocalizationProvider';
import {
  loadRuntimeReadwiseSourceResyncActionState,
  resyncRuntimeReadwiseSource
} from '../../../shared/platform/import/readwiseSourceResyncRuntimeRepository';
import { requestAppConfirmation } from '../../../shared/ui/appConfirmation';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { NodeContextMenuItem, NodeContextMenuSeparator } from './nodeListContextMenuPresentation';

function confirmationDescription(state: NativeReadwiseSourceResyncActionState, t: Translate) {
  const lines = [
    t('desktop.nodeList.readwiseResync.confirm.description'),
    t('desktop.nodeList.readwiseResync.confirm.preserve')
  ];
  if (state.category === 'epub') lines.splice(1, 0, t('desktop.nodeList.readwiseResync.confirm.epub'));
  if (state.category === 'epub' && state.body_authority === 'original_epub') {
    lines.push(t('desktop.nodeList.readwiseResync.confirm.switchFromEpub'));
  }
  return lines;
}

export function ReadwiseSourceResyncMenuItem(props: {
  hasPreviousGroup: boolean;
  nodeId: string | null;
}) {
  const t = useTranslation();
  const [state, setState] = useState<NativeReadwiseSourceResyncActionState | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    if (props.nodeId) {
      void loadRuntimeReadwiseSourceResyncActionState(props.nodeId)
        .then((next) => { if (active) setState(next); })
        .catch(() => { if (active) setState(null); });
    }
    return () => { active = false; };
  }, [props.nodeId]);

  if (!props.nodeId || !state || state.status === 'not_applicable') return null;
  const label = state.status === 'reconnect_required'
    ? t('desktop.nodeList.menu.readwiseResync.reconnect')
    : state.status === 'running'
      ? t('desktop.nodeList.menu.readwiseResync.running')
      : state.status === 'source_inactive'
        ? t('desktop.nodeList.menu.readwiseResync.sourceInactive')
        : t('desktop.nodeList.menu.readwiseResync');
  const run = async () => {
    if (state.status !== 'ready' || !props.nodeId) return;
    const confirmed = await requestAppConfirmation({
      confirmLabel: t('desktop.nodeList.readwiseResync.confirm.confirm'),
      description: confirmationDescription(state, t),
      title: t('desktop.nodeList.readwiseResync.confirm.title')
    });
    if (!confirmed) return;
    showAppRuntimeNotice(t('desktop.nodeList.readwiseResync.running'));
    const result = await resyncRuntimeReadwiseSource(props.nodeId).catch(() => null);
    showAppRuntimeNotice(t(result?.status === 'completed'
      ? 'desktop.nodeList.readwiseResync.success'
      : 'desktop.nodeList.readwiseResync.failed'), result?.status === 'completed' ? 'info' : 'error');
  };
  const followsEpubAction = state.category === 'epub';
  return (
    <>
      {props.hasPreviousGroup && !followsEpubAction ? <NodeContextMenuSeparator /> : null}
      <NodeContextMenuItem disabled={state.status !== 'ready'} icon={RefreshCw} onSelect={() => void run()}>
        {label}
      </NodeContextMenuItem>
      <NodeContextMenuSeparator />
    </>
  );
}

import { BookDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { NativeReadwiseOriginalEpubActionState } from '../../../../lib/platform/nativeReadwiseContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  loadRuntimeReadwiseOriginalEpubActionState,
  useRuntimeReadwiseOriginalEpub
} from '../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository';
import { onRuntimeReadwiseBookEpubProgress } from '../../../shared/platform/readwiseBooksRuntimeRepository';
import { requestAppConfirmation } from '../../../shared/ui/appConfirmation';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { NodeContextMenuItem, NodeContextMenuSeparator } from './nodeListContextMenuPresentation';

const PHASE_NOTICE_KEYS = {
  downloading_epub: 'desktop.nodeList.originalEpub.phase.downloading_epub',
  getting_original: 'desktop.nodeList.originalEpub.phase.getting_original',
  importing_epub: 'desktop.nodeList.originalEpub.phase.importing_epub',
  locating_highlights: 'desktop.nodeList.originalEpub.phase.locating_highlights',
  placing_highlights: 'desktop.nodeList.originalEpub.phase.placing_highlights',
  reading_epub: 'desktop.nodeList.originalEpub.phase.reading_epub',
  saving: 'desktop.nodeList.originalEpub.phase.saving'
} as const;

function confirmEpubRebuild(t: ReturnType<typeof useTranslation>) {
  return requestAppConfirmation({
    confirmLabel: t('desktop.nodeList.originalEpub.confirm.confirm'),
    description: t('desktop.nodeList.originalEpub.confirm.description'),
    title: t('desktop.nodeList.originalEpub.confirm.title')
  });
}

export function ReadwiseOriginalEpubMenuItem(props: {
  hasPreviousGroup: boolean;
  nodeId: string | null;
}) {
  const t = useTranslation();
  const [state, setState] = useState<NativeReadwiseOriginalEpubActionState | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    if (props.nodeId) {
      void loadRuntimeReadwiseOriginalEpubActionState(props.nodeId)
        .then((next) => { if (active) setState(next); })
        .catch(() => { if (active) setState(null); });
    }
    return () => { active = false; };
  }, [props.nodeId]);

  if (!props.nodeId || !state || state.status === 'not_applicable') return null;
  const label = state.status === 'reconnect_required'
      ? t('desktop.nodeList.menu.useOriginalEpub.reconnect')
      : state.status === 'running'
        ? t('desktop.nodeList.menu.useOriginalEpub.running')
        : state.status === 'source_inactive'
          ? t('desktop.nodeList.menu.useOriginalEpub.sourceInactive')
          : t('desktop.nodeList.menu.useOriginalEpub');
  const run = async () => {
    if (state.status !== 'ready' || !props.nodeId) return;
    if (!await confirmEpubRebuild(t)) return;
    const nodeId = props.nodeId;
    const unsubscribe = onRuntimeReadwiseBookEpubProgress((event) => {
      if (event.nodeId !== nodeId || !(event.phase in PHASE_NOTICE_KEYS)) return;
      const key = PHASE_NOTICE_KEYS[event.phase as keyof typeof PHASE_NOTICE_KEYS];
      showAppRuntimeNotice(t(key));
    });
    showAppRuntimeNotice(t('desktop.nodeList.originalEpub.getting'));
    const result = await useRuntimeReadwiseOriginalEpub(nodeId).catch(() => null).finally(() => unsubscribe?.());
    if (result?.status === 'completed') {
      showAppRuntimeNotice(t('desktop.nodeList.originalEpub.success'));
      return;
    }
    const missing = result?.error_code === 'original_epub_not_distributed';
    showAppRuntimeNotice(t(missing
      ? 'desktop.nodeList.originalEpub.missing'
      : 'desktop.nodeList.originalEpub.failed'), 'error');
  };
  return (
    <>
      {props.hasPreviousGroup ? <NodeContextMenuSeparator /> : null}
      <NodeContextMenuItem disabled={state.status !== 'ready'} icon={BookDown} onSelect={() => void run()}>
        {label}
      </NodeContextMenuItem>
      <NodeContextMenuSeparator />
    </>
  );
}

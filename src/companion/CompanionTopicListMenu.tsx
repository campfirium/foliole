import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionListInteraction } from './CompanionListViewport';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export function CompanionTopicListMenu(props: { inline?: boolean; nodeId?: string; title: string; metadata: string; onOpen(): void }) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const interaction = useCompanionListInteraction();
  useEffect(() => {
    if (!open && !infoOpen) return;
    interaction(true);
    return () => interaction(false);
  }, [open, infoOpen, interaction]);
  return (
    <>
      <button aria-label={`${t('companion.browse.more')}: ${props.title}`} className={props.inline ? 'flex h-11 w-11 shrink-0 items-center justify-center text-companion-text-tertiary' : 'companion-topic-more'} onClick={() => setOpen(true)} type="button">
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>
      <CompanionBottomSheet onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
        <button className="block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm" onClick={() => { setOpen(false); props.onOpen(); }} type="button">
          {t('desktop.searchPreview.open')}
        </button>
        {props.nodeId && workspace && isAvailableNativeCompanionRuntime() && <button type="button" className="block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm"
          disabled={workspace.busy || workspace.pending} onClick={() => { setOpen(false); workspace.open({ mode: 'menu', nodeId: props.nodeId!, parentNodeId: null }); }}>
          {t('companion.workspace.manage')}</button>}
        <button className="block min-h-11 w-full py-3 text-left text-sm" onClick={() => { setOpen(false); setInfoOpen(true); }} type="button">
          {t('companion.reading.info')}
        </button>
      </CompanionBottomSheet>
      <CompanionBottomSheet onOpenChange={setInfoOpen} open={infoOpen} title={t('companion.reading.info')}>
        <p className="text-base leading-6">{props.title}</p>
        <p className="mt-3 text-sm text-companion-text-secondary">{props.metadata}</p>
      </CompanionBottomSheet>
    </>
  );
}

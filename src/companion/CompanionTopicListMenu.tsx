import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionListInteraction } from './CompanionListViewport';
import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';

export function CompanionTopicListMenu(props: { inline?: boolean; nodeId?: string; title: string; metadata: string; onOpen(): void }) {
  const t = useTranslation();
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
      <CompanionBottomSheet showScrollIndicator onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
        <TopicListMenuActions nodeId={props.nodeId} onClose={() => setOpen(false)} onOpen={() => {
          setOpen(false);
          props.onOpen();
        }}>
          <button className={companionWorkspaceRowClass} onClick={() => { setOpen(false); setInfoOpen(true); }} type="button">
            {t('companion.reading.info')}
          </button>
        </TopicListMenuActions>
      </CompanionBottomSheet>
      <CompanionBottomSheet onOpenChange={setInfoOpen} open={infoOpen} title={t('companion.reading.info')}>
        <p className="text-base leading-6">{props.title}</p>
        <p className="mt-3 text-sm text-companion-text-secondary">{props.metadata}</p>
      </CompanionBottomSheet>
    </>
  );
}

function TopicListMenuActions({ nodeId, onClose, onOpen, children }: {
  nodeId?: string | undefined; onClose(): void; onOpen(): void; children: ReactNode;
}) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  if (!nodeId || !workspace?.snapshot?.nodesById[nodeId] || !isAvailableNativeCompanionRuntime()) {
    return <>
      <button className={companionWorkspaceRowClass} onClick={onOpen} type="button">{t('desktop.searchPreview.open')}</button>
      {children}
    </>;
  }
  return <CompanionWorkspaceMenuActions nodeId={nodeId} onOpen={onOpen} onSaved={onClose}
    onSelect={state => { onClose(); workspace.open(state); }}>
    <CompanionNodePrioritySlider nodeId={nodeId} onSaved={onClose} />
    {children}
  </CompanionWorkspaceMenuActions>;
}

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionListInteraction } from './CompanionListViewport';
import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';

export function CompanionTopicListMenu(props: { rowMenu?: { open: boolean; onOpenChange(open: boolean): void }; nodeId?: string; title: string; metadata: string; directDiveId?: string | undefined }) {
  const t = useTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.rowMenu?.open ?? localOpen;
  const setOpen = props.rowMenu?.onOpenChange ?? setLocalOpen;
  const [infoOpen, setInfoOpen] = useState(false);
  const interaction = useCompanionListInteraction();
  useEffect(() => {
    if (!open && !infoOpen) return;
    interaction(true);
    return () => interaction(false);
  }, [open, infoOpen, interaction]);
  return (
    <>
      {!props.rowMenu && <button aria-label={`${t('companion.browse.more')}: ${props.title}`} className="companion-topic-more" onClick={() => setOpen(true)} type="button">
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>}
      <CompanionBottomSheet showScrollIndicator onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
        <TopicListMenuActions nodeId={props.nodeId} diveId={props.directDiveId} onClose={() => setOpen(false)}>
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

function TopicListMenuActions({ nodeId, diveId, onClose, children }: {
  nodeId?: string | undefined; diveId?: string | undefined; onClose(): void; children: ReactNode;
}) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  if (!nodeId || !workspace?.snapshot?.nodesById[nodeId] || !isAvailableNativeCompanionRuntime()) return children;
  return <CompanionWorkspaceMenuActions nodeId={nodeId} onSaved={onClose}
    onSelect={state => { onClose(); workspace.open(state); }}>
    <CompanionNodePrioritySlider nodeId={nodeId} onSaved={onClose} />
    {diveId && <button type="button" className={companionWorkspaceRowClass} disabled={workspace.busy || workspace.pending}
      onClick={() => workspace.removeFromDive(diveId, nodeId, onClose)}>{t('desktop.nodeList.menu.removeFromDive')}</button>}
    {children}
  </CompanionWorkspaceMenuActions>;
}

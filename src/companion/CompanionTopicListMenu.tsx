import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { useCompanionListInteraction } from './CompanionListViewport';
import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import { CompanionNodeReviewMenuRows, CompanionNodeReviewOptionsSheet } from './CompanionNodeReviewOptions';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, getCompanionWorkspaceMenuOptions } from './CompanionWorkspaceMenuActions';

export function useTopicListMenuWorkspace(nodeId?: string, diveId?: string) {
  const workspace = useCompanionWorkspaceActions();
  const nodes = workspace?.snapshot?.nodesById;
  const node = nodeId ? nodes?.[nodeId] : undefined;
  if (!workspace || !nodes || !node || !isAvailableNativeCompanionRuntime()) return null;
  const { mutable, childKinds, canAddToDive } = getCompanionWorkspaceMenuOptions(node, nodes);
  return mutable || node.deletedAt || childKinds.length || canAddToDive || diveId ? workspace : null;
}

export function CompanionTopicListMenu({ rowMenu, nodeId, title, directDiveId }: {
  rowMenu?: { open: boolean; onOpenChange(open: boolean): void };
  nodeId: string;
  title: string;
  directDiveId?: string | undefined;
}) {
  const t = useTranslation();
  const workspace = useTopicListMenuWorkspace(nodeId, directDiveId);
  const [localOpen, setLocalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const open = Boolean(workspace && (rowMenu?.open ?? localOpen));
  const setOpen = rowMenu?.onOpenChange ?? setLocalOpen;
  const interaction = useCompanionListInteraction();
  useEffect(() => {
    if (!open && !optionsOpen) return;
    interaction(true);
    return () => interaction(false);
  }, [open, optionsOpen, interaction]);
  if (!workspace) return null;
  const close = () => setOpen(false);
  return (
    <>
      {!rowMenu && <button aria-label={`${t('companion.browse.more')}: ${title}`} className="companion-topic-more" onClick={() => setOpen(true)} type="button">
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>}
      <CompanionMenuSheet onOpenChange={setOpen} open={open} title={title}>
        <CompanionWorkspaceMenuActions menuRows nodeId={nodeId} onSaved={close}
          onSelect={state => { close(); workspace.open(state); }}>
          <CompanionNodeReviewMenuRows nodeId={nodeId} onSaved={close} onOpenOptions={() => { close(); setOptionsOpen(true); }} />
          {directDiveId && <CompanionMenuRow label={t('desktop.nodeList.menu.removeFromDive')} disabled={workspace.busy || workspace.pending}
            onSelect={() => workspace.removeFromDive(directDiveId, [nodeId], close)} />}
        </CompanionWorkspaceMenuActions>
      </CompanionMenuSheet>
      {optionsOpen && <CompanionNodeReviewOptionsSheet nodeId={nodeId} open onOpenChange={setOptionsOpen} />}
    </>
  );
}

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import { resolveDiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionListInteraction } from './CompanionListViewport';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export function CompanionDirectoryConversionMenu({ nodeId, title }: { nodeId: string; title: string }) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const [open, setOpen] = useState(false);
  const interaction = useCompanionListInteraction();
  const nodes = workspace?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  const target = resolveDiveDirectoryConversionTarget(node);
  const trashedDive = Boolean(node?.deletedAt && readDiveNode(node));
  const available = Boolean(target || trashedDive);
  useEffect(() => {
    if (!open || !available) return;
    interaction(true);
    return () => interaction(false);
  }, [open, available, interaction]);
  if (!workspace || !available || !isAvailableNativeCompanionRuntime()) return null;
  return <>
    <button type="button" aria-haspopup="dialog" aria-label={`${t('companion.browse.more')}: ${title}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center text-companion-text-tertiary"
      onClick={() => setOpen(true)}>
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
    </button>
    <CompanionBottomSheet onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
      {target && <button type="button" className="min-h-11 w-full py-3 text-left text-sm" disabled={workspace.busy || workspace.pending}
        onClick={() => {
          setOpen(false);
          workspace.open({ mode: target === 'dive' ? 'convert-to-dive' : 'convert-to-index', nodeId, parentNodeId: null });
        }}>
        {t(target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
      </button>}
      {target === 'index' && <button type="button" className="min-h-11 w-full py-3 text-left text-sm text-error"
        disabled={workspace.busy || workspace.pending} onClick={() => {
          setOpen(false);
          workspace.open({ mode: 'delete', nodeId, parentNodeId: null });
        }}>{t('companion.workspace.delete')}</button>}
      {trashedDive && <button type="button" className="min-h-11 w-full py-3 text-left text-sm"
        disabled={workspace.busy || workspace.pending} onClick={() => void workspace.execute({ type: 'restore', nodeId }, () => setOpen(false))}>
        {t('companion.reading.restoreFromTrash')}</button>}
    </CompanionBottomSheet>
  </>;
}

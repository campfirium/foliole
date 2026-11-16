import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  const target = resolveDiveDirectoryConversionTarget(nodes?.[nodeId]);
  useEffect(() => {
    if (!open || !target) return;
    interaction(true);
    return () => interaction(false);
  }, [open, target, interaction]);
  if (!workspace || !target || !isAvailableNativeCompanionRuntime()) return null;
  return <>
    <button type="button" aria-haspopup="dialog" aria-label={`${t('companion.browse.more')}: ${title}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center text-companion-text-tertiary"
      onClick={() => setOpen(true)}>
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
    </button>
    <CompanionBottomSheet onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
      <button type="button" className="min-h-11 w-full py-3 text-left text-sm" disabled={workspace.busy || workspace.pending}
        onClick={() => {
          setOpen(false);
          workspace.open({ mode: target === 'dive' ? 'convert-to-dive' : 'convert-to-index', nodeId, parentNodeId: null });
        }}>
        {t(target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
      </button>
    </CompanionBottomSheet>
  </>;
}

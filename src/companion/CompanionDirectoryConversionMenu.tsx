import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import { resolveDiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion';
import { isManualVirtualFolderNode } from '../../lib/core/nodes/virtualNodeFilter';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { companionIndexSourcePromptKeys } from './CompanionIndexSourceForm';
import { useCompanionListInteraction } from './CompanionListViewport';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

function IndexMembershipMenuActions({ disabled, hasSources, openSheet }: {
  disabled: boolean;
  hasSources: boolean;
  openSheet(mode: 'add-index-source' | 'remove-index-source'): void;
}) {
  const t = useTranslation();
  const rowClass = 'min-h-11 w-full py-3 text-left text-sm';
  return <>
    <button type="button" className={rowClass} disabled={disabled} onClick={() => openSheet('add-index-source')}>
      {t(companionIndexSourcePromptKeys.add)}</button>
    {hasSources && <button type="button" className={rowClass} disabled={disabled} onClick={() => openSheet('remove-index-source')}>
      {t(companionIndexSourcePromptKeys.remove)}</button>}
  </>;
}

export function CompanionDirectoryConversionMenu({ nodeId, title, onStart, folderRestoreMenu }: {
  nodeId: string;
  title: string;
  onStart?: (() => void) | undefined;
  folderRestoreMenu?: { open: boolean; setOpen(open: boolean): void; restore(onSaved: () => void): void } | undefined;
}) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const [buttonMenuOpen, setButtonMenuOpen] = useState(false);
  const open = folderRestoreMenu?.open ?? buttonMenuOpen;
  const setOpen = folderRestoreMenu?.setOpen ?? setButtonMenuOpen;
  const interaction = useCompanionListInteraction();
  const nodes = workspace?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  const target = resolveDiveDirectoryConversionTarget(node);
  const manualIndex = isManualVirtualFolderNode(node);
  const canRename = manualIndex && !node?.deletedAt;
  const canTrash = target === 'index' || canRename;
  const canRestore = Boolean(folderRestoreMenu || (node?.deletedAt && (readDiveNode(node) || manualIndex)));
  const available = Boolean(onStart || (workspace && (target || canRestore) && isAvailableNativeCompanionRuntime()));
  useEffect(() => {
    if (!open || !available) return;
    interaction(true);
    return () => interaction(false);
  }, [open, available, interaction]);
  if (!available) return null;
  const close = () => setOpen(false);
  const openSheet = (mode: WorkspaceNodeSheetState['mode']) => {
    close();
    workspace?.open({ mode, nodeId, parentNodeId: null });
  };
  return <>
    {!folderRestoreMenu && <button type="button" aria-haspopup="dialog" aria-label={`${t('companion.browse.more')}: ${title}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center text-companion-text-tertiary"
      onClick={() => setOpen(true)}>
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
    </button>}
    <CompanionBottomSheet onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
      {onStart && <button type="button" className="min-h-11 w-full py-3 text-left text-sm"
        onClick={() => { close(); onStart(); }}>
        {t('desktop.nodeList.dive.startFlow')}
      </button>}
      {workspace && canRename && <IndexMembershipMenuActions disabled={workspace.busy || workspace.pending}
        hasSources={Boolean(node?.manualChildOrder?.length)} openSheet={openSheet} />}
      {workspace && target && <button type="button" className="min-h-11 w-full py-3 text-left text-sm" disabled={workspace.busy || workspace.pending}
        onClick={() => openSheet(target === 'dive' ? 'convert-to-dive' : 'convert-to-index')}>
        {t(target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
      </button>}
      {workspace && canRename && <button type="button" className="min-h-11 w-full py-3 text-left text-sm"
        disabled={workspace.busy || workspace.pending} onClick={() => openSheet('rename')}>{t('desktop.command.rename')}</button>}
      {workspace && canTrash && <button type="button" className="min-h-11 w-full py-3 text-left text-sm text-error"
        disabled={workspace.busy || workspace.pending} onClick={() => openSheet('delete')}>{t('companion.workspace.delete')}</button>}
      {workspace && canRestore && <button type="button" className="min-h-11 w-full py-3 text-left text-sm"
        disabled={workspace.busy || workspace.pending} onClick={() => folderRestoreMenu
          ? folderRestoreMenu.restore(close) : void workspace.execute({ type: 'restore', nodeId }, close)}>
        {t('companion.reading.restoreFromTrash')}</button>}
    </CompanionBottomSheet>
  </>;
}

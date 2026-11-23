import { useEffect } from 'react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import { resolveDiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion';
import { isManualVirtualFolderNode, isVirtualIndexFolderNode } from '../../lib/core/nodes/virtualNodeFilter';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { companionIndexSourcePromptKeys } from './CompanionIndexSourceForm';
import { useCompanionListInteraction } from './CompanionListViewport';
import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

function IndexMembershipMenuActions({ disabled, hasSources, openSheet }: {
  disabled: boolean;
  hasSources: boolean;
  openSheet(mode: 'add-index-source' | 'remove-index-source'): void;
}) {
  const t = useTranslation();
  return <>
    <CompanionMenuRow disabled={disabled} label={t(companionIndexSourcePromptKeys.add)}
      onSelect={() => openSheet('add-index-source')} />
    {hasSources && <CompanionMenuRow disabled={disabled} label={t(companionIndexSourcePromptKeys.remove)}
      onSelect={() => openSheet('remove-index-source')} />}
  </>;
}

export function useDirectoryConversionMenu({ nodeId, enabled, onStart, restore }: {
  nodeId: string;
  enabled: boolean;
  onStart?: (() => void) | undefined;
  restore?: ((onSaved: () => void) => void) | undefined;
}) {
  const workspace = useCompanionWorkspaceActions();
  if (!enabled) return null;
  const node = workspace?.snapshot?.nodesById[nodeId];
  const target = resolveDiveDirectoryConversionTarget(node);
  // A manual index and a saved search are both user indexes; only the manual one takes hand-picked sources.
  const userIndex = isVirtualIndexFolderNode(node);
  const canRename = userIndex && !node?.deletedAt;
  const canEditSources = canRename && isManualVirtualFolderNode(node);
  const canTrash = target === 'index' || canRename;
  const canRestore = Boolean(restore || (node?.deletedAt && (readDiveNode(node) || userIndex)));
  if (!onStart && !(workspace && (target || canRestore) && isAvailableNativeCompanionRuntime())) return null;
  return { nodeId, workspace, node, target, canRename, canEditSources, canTrash, canRestore, onStart, restore };
}

export function CompanionDirectoryConversionMenu({ menu, open, setOpen, title }: {
  menu: NonNullable<ReturnType<typeof useDirectoryConversionMenu>>;
  open: boolean;
  title: string;
  setOpen(open: boolean): void;
}) {
  const { nodeId, workspace, node, target, canRename, canEditSources, canTrash, canRestore, onStart, restore } = menu;
  const t = useTranslation();
  const interaction = useCompanionListInteraction();
  useEffect(() => {
    if (!open) return;
    interaction(true);
    return () => interaction(false);
  }, [open, interaction]);
  const close = () => setOpen(false);
  const openSheet = (mode: WorkspaceNodeSheetState['mode']) => {
    close();
    workspace?.open({ mode, nodeId, parentNodeId: null });
  };
  return (
    <CompanionMenuSheet onOpenChange={setOpen} open={open} title={title}>
      {onStart && <CompanionMenuRow label={t('desktop.nodeList.dive.startFlow')}
        onSelect={() => { close(); onStart(); }} />}
      {workspace && canEditSources && <IndexMembershipMenuActions disabled={workspace.busy || workspace.pending}
        hasSources={Boolean(node?.manualChildOrder?.length)} openSheet={openSheet} />}
      {workspace && target && <CompanionMenuRow disabled={workspace.busy || workspace.pending}
        label={t(target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
        onSelect={() => openSheet(target === 'dive' ? 'convert-to-dive' : 'convert-to-index')} />}
      {workspace && canRename && <CompanionMenuRow disabled={workspace.busy || workspace.pending}
        label={t('desktop.command.rename')} onSelect={() => openSheet('rename')} />}
      {workspace && canTrash && <CompanionMenuRow destructive disabled={workspace.busy || workspace.pending}
        label={t('companion.workspace.delete')} onSelect={() => openSheet('delete')} />}
      {workspace && canRestore && <CompanionMenuRow disabled={workspace.busy || workspace.pending}
        label={t('companion.reading.restoreFromTrash')}
        onSelect={() => restore ? restore(close) : void workspace.execute({ type: 'restore', nodeId }, close)} />}
    </CompanionMenuSheet>
  );
}

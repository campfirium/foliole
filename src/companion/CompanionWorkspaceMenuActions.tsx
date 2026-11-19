import type { ReactNode } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

export const companionWorkspaceRowClass = 'flex min-h-11 w-full items-center border-b border-companion-divider py-2.5 text-left text-sm [overflow-wrap:anywhere] disabled:opacity-40';

export function CompanionWorkspaceMenuActions({ nodeId, onSelect, onSaved, hasRestoreAction, children }: {
  nodeId: string;
  onSelect(state: WorkspaceNodeSheetState): void;
  hasRestoreAction?: boolean;
  onSaved?: () => void;
  children?: ReactNode;
}) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const nodes = actions?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  if (!actions || !node) return children;
  const disabled = actions.busy || actions.pending;
  const mutable = !node.id.startsWith('special-') && !node.virtualFilter && !node.deletedAt;
  const canMove = mutable && canNodeBeMoved(node);
  const childKinds = (['folder', 'topic', 'item'] as const).filter(kind => !node.deletedAt &&
    node.id !== 'special-home' && node.id !== 'special-virtual-root' && !node.virtualFilter && canCreateChildNodeKind(node.kind, kind));
  const parentKind = node.parentNodeId ? nodes?.[node.parentNodeId]?.kind : undefined;
  const canAddToDive = canUseDiveSource(node, parentKind);
  const select = (mode: WorkspaceNodeSheetState['mode']) => onSelect({ mode, nodeId, parentNodeId: null });
  const row = (label: string, onClick: () => void) => (
    <button key={label} type="button" className={companionWorkspaceRowClass} disabled={disabled} onClick={onClick}>{label}</button>
  );

  return <>
    {children}
    {mutable && row(t('desktop.command.rename'), () => select('rename'))}
    {canMove && row(t('desktop.command.moveToNode'), () => select('move'))}
    {canAddToDive && row(t('desktop.nodeList.menu.addToDive'), () => select('add-to-dive'))}
    {mutable && node.kind === 'topic' && !node.anchorLink && row(t(node.shelvedAt ? 'companion.workspace.unshelve' : 'companion.workspace.shelve'),
      () => void actions.execute({ type: node.shelvedAt ? 'unshelve' : 'shelve', nodeId }, onSaved))}
    {childKinds.map(kind => row(t(kind === 'folder' ? 'desktop.command.createFolder' : kind === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem'),
      () => onSelect({ mode: 'create', nodeId: null, parentNodeId: nodeId, kind })))}
    {node.deletedAt && !hasRestoreAction && row(t('companion.reading.restoreFromTrash'), () => void actions.execute({ type: 'restore', nodeId }, onSaved))}
    {mutable && <button type="button" className={`${companionWorkspaceRowClass} last:border-b-0 text-error`}
      disabled={disabled} onClick={() => select('delete')}>{t('companion.workspace.delete')}</button>}
  </>;
}

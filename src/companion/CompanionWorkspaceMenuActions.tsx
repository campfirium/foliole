import type { ReactNode } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionMenuRow } from './CompanionMenuSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

export const companionWorkspaceRowClass = 'flex min-h-11 w-full items-center border-b border-companion-divider py-2.5 text-left text-sm [overflow-wrap:anywhere] disabled:opacity-40';

type MenuNodes = WorkspaceSnapshot['nodesById'];

export function getCompanionWorkspaceMenuOptions(node: MenuNodes[string], nodes: MenuNodes) {
  const mutable = !node.id.startsWith('special-') && !node.virtualFilter && !node.deletedAt;
  const childKinds = (['folder', 'topic', 'item'] as const).filter(kind => !node.deletedAt &&
    node.id !== 'special-home' && node.id !== 'special-virtual-root' && !node.virtualFilter && canCreateChildNodeKind(node.kind, kind));
  const parentKind = node.parentNodeId ? nodes[node.parentNodeId]?.kind : undefined;
  return { mutable, childKinds, canAddToDive: canUseDiveSource(node, parentKind) };
}

export function CompanionWorkspaceMenuActions({ nodeId, onSelect, onSaved, hasRestoreAction, menuRows, children }: {
  nodeId: string;
  onSelect(state: WorkspaceNodeSheetState): void;
  hasRestoreAction?: boolean;
  menuRows?: boolean;
  onSaved?: () => void;
  children?: ReactNode;
}) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const nodes = actions?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  if (!actions || !nodes || !node) return children;
  const disabled = actions.busy || actions.pending;
  const { mutable, childKinds, canAddToDive } = getCompanionWorkspaceMenuOptions(node, nodes);
  const canMove = mutable && canNodeBeMoved(node);
  const select = (mode: WorkspaceNodeSheetState['mode']) => onSelect({ mode, nodeId, parentNodeId: null });
  const row = (label: string, onClick: () => void, destructive = false) => menuRows ? (
    <CompanionMenuRow key={label} label={label} destructive={destructive} disabled={disabled} onSelect={onClick} />
  ) : (
    <button key={label} type="button" className={destructive ? `${companionWorkspaceRowClass} last:border-b-0 text-error` : companionWorkspaceRowClass}
      disabled={disabled} onClick={onClick}>{label}</button>
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
    {mutable && row(t('companion.workspace.delete'), () => select('delete'), true)}
  </>;
}

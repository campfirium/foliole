import { ArchiveRestore, BookMarked, CalendarClock, CircleOff, FilePlus2, FolderPlus, ListPlus, MoveRight, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { AddToDiveMenuIcon, RenameMenuIcon } from '../features/nodes/components/nodeListContextMenuPresentation';
import { collectTopicDismissIds } from '../features/nodes/model/nodeDismissTargets';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { canDelayTopic } from '../store/topicDelayReading';
import { canDismissWorkspaceNode } from '../store/workspaceDismissChanges';

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

/** Whether the desktop "Dismiss topic" would take anything out of learning: the topic or an eligible node below it. */
export function canDismissCompanionTopicBranch(node: MenuNodes[string], nodes: MenuNodes) {
  if (node.kind !== 'topic' || node.deletedAt || node.id.startsWith('special-')) return false;
  return collectTopicDismissIds(node.id, nodes).some(id => canDismissWorkspaceNode(nodes[id]));
}

/** Same icons as the desktop node context menu for the same commands. */
const createIcons = { folder: FolderPlus, topic: FilePlus2, item: ListPlus } as const;

/** Icon rows matching the reading sheet's own rows, so one sheet never mixes icon and text-only rows. */
export function CompanionWorkspaceIconRow(props: { icon: LucideIcon; label: string; destructive?: boolean; disabled?: boolean; onClick(): void }) {
  const Icon = props.icon;
  return <button type="button" disabled={props.disabled} onClick={props.onClick}
    className={`${companionWorkspaceRowClass} gap-3 font-medium transition-colors active:bg-companion-subtle/80 ${props.destructive ? 'last:border-b-0 text-error' : 'text-foreground'}`}>
    <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${props.destructive ? '' : 'text-companion-text-secondary'}`} />
    <span>{props.label}</span>
  </button>;
}

export function CompanionWorkspaceMenuActions({ nodeId, onSelect, onSaved, hasRestoreAction, menuRows, withIcons, hideCreate, children }: {
  nodeId: string;
  onSelect(state: WorkspaceNodeSheetState): void;
  hasRestoreAction?: boolean;
  menuRows?: boolean;
  withIcons?: boolean;
  hideCreate?: boolean;
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
  const row = (label: string, onClick: () => void, destructive = false, icon?: LucideIcon) => menuRows ? (
    <CompanionMenuRow key={label} label={label} destructive={destructive} disabled={disabled} onSelect={onClick} />
  ) : withIcons && icon ? (
    <CompanionWorkspaceIconRow key={label} icon={icon} label={label} destructive={destructive} disabled={disabled} onClick={onClick} />
  ) : (
    <button key={label} type="button" className={destructive ? `${companionWorkspaceRowClass} last:border-b-0 text-error` : companionWorkspaceRowClass}
      disabled={disabled} onClick={onClick}>{label}</button>
  );

  return <>
    {children}
    {mutable && row(t('desktop.command.rename'), () => select('rename'), false, RenameMenuIcon)}
    {canMove && row(t('desktop.command.moveToNode'), () => select('move'), false, MoveRight)}
    {canAddToDive && row(t('desktop.nodeList.menu.addToDive'), () => select('add-to-dive'), false, AddToDiveMenuIcon)}
    {mutable && !actions.flowActive && canDelayTopic(node) && row(t('desktop.reviewDelay.dialog'), () => select('postpone'), false, CalendarClock)}
    {mutable && node.kind === 'topic' && !node.anchorLink && row(t(node.shelvedAt ? 'companion.workspace.unshelve' : 'companion.workspace.shelve'),
      () => void actions.execute({ type: node.shelvedAt ? 'unshelve' : 'shelve', nodeId }, onSaved), false, BookMarked)}
    {mutable && node.currentVersionId && canDismissCompanionTopicBranch(node, nodes) && row(t('desktop.nodeList.menu.dismissTopic'),
      () => void actions.dismissTopicBranch({ id: nodeId, version: node.currentVersionId! }, onSaved), false, CircleOff)}
    {!hideCreate && childKinds.map(kind => row(t(kind === 'folder' ? 'desktop.command.createFolder' : kind === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem'),
      () => onSelect({ mode: 'create', nodeId: null, parentNodeId: nodeId, kind }), false, createIcons[kind]))}
    {node.deletedAt && !hasRestoreAction && row(t('companion.reading.restoreFromTrash'), () => void actions.execute({ type: 'restore', nodeId }, onSaved), false, ArchiveRestore)}
    {mutable && row(t('companion.workspace.delete'), () => select('delete'), true, Trash2)}
  </>;
}

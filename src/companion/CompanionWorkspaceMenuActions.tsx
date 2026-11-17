import { FolderInput, ListPlus, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

export const companionWorkspaceRowClass = 'block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm disabled:opacity-40';
const shortcutClass = 'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-sm [overflow-wrap:anywhere] disabled:opacity-40';

export function CompanionWorkspaceMenuActions({ nodeId, onSelect, shortcuts, onSaved, hasRestoreAction, children }: {
  nodeId: string;
  onSelect(state: WorkspaceNodeSheetState): void;
  shortcuts?: boolean;
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
    {shortcuts ? (mutable || canAddToDive) && <div className="grid auto-cols-fr grid-flow-col border-b border-companion-divider">
      {mutable && <button type="button" className={shortcutClass} disabled={disabled} onClick={() => select('rename')}>
        <Pencil aria-hidden="true" size={18} />{t('desktop.command.rename')}
      </button>}
      {canMove && <button type="button" className={shortcutClass} disabled={disabled} onClick={() => select('move')}>
        <FolderInput aria-hidden="true" size={18} />{t('desktop.command.moveToNode')}
      </button>}
      {canAddToDive && <button type="button" className={shortcutClass} disabled={disabled} onClick={() => select('add-to-dive')}>
        <ListPlus aria-hidden="true" size={18} />{t('desktop.nodeList.menu.addToDive')}
      </button>}
    </div> : <>
      {mutable && row(t('desktop.command.rename'), () => select('rename'))}
      {canMove && row(t('desktop.command.moveToNode'), () => select('move'))}
      {canAddToDive && row(t('desktop.nodeList.menu.addToDive'), () => select('add-to-dive'))}
    </>}
    {mutable && node.kind === 'topic' && !node.anchorLink && row(t(node.shelvedAt ? 'companion.workspace.unshelve' : 'companion.workspace.shelve'),
      () => void actions.execute({ type: node.shelvedAt ? 'unshelve' : 'shelve', nodeId }, onSaved))}
    {childKinds.map(kind => row(t(kind === 'folder' ? 'desktop.command.createFolder' : kind === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem'),
      () => onSelect({ mode: 'create', nodeId: null, parentNodeId: nodeId, kind })))}
    {children}
    {node.deletedAt && !hasRestoreAction && row(t('companion.reading.restoreFromTrash'), () => void actions.execute({ type: 'restore', nodeId }, onSaved))}
    {mutable && <button type="button" className="block min-h-11 w-full py-3 text-left text-sm text-error disabled:opacity-40"
      disabled={disabled} onClick={() => select('delete')}>{t('companion.workspace.delete')}</button>}
  </>;
}

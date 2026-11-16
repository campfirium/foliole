import { useState } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionAddToDive } from './CompanionAddToDive';
import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceNodeForm } from './CompanionWorkspaceNodeForm';

export type WorkspaceNodeSheetState = { mode: 'menu' | 'rename' | 'move' | 'create' | 'delete' | 'add-to-dive'; nodeId: string | null; parentNodeId: string | null };
const rowClass = 'min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm disabled:opacity-40';

export function CompanionWorkspaceNodeSheet(props: { state: WorkspaceNodeSheetState; onClose(): void }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const [mode, setMode] = useState(props.state.mode);
  const node = actions?.snapshot?.nodesById[props.state.nodeId ?? ''];
  if (!actions) return null;
  const disabled = actions.busy || actions.pending;
  const menuRow = (label: string, onClick: () => void) => <button key={label} type="button" disabled={disabled} className={rowClass} onClick={onClick}>{label}</button>;
  const mutable = node && !node.id.startsWith('special-') && !node.virtualFilter && !node.deletedAt;
  const childKinds = (['folder', 'topic', 'item'] as const).filter(value => node && !node.deletedAt &&
    node.id !== 'special-home' && node.id !== 'special-virtual-root' && !node.virtualFilter && canCreateChildNodeKind(node.kind, value));
  const parentKind = node?.parentNodeId ? actions.snapshot?.nodesById[node.parentNodeId]?.kind : undefined;
  const adding = mode === 'add-to-dive';
  return <CompanionBottomSheet open onOpenChange={open => { if (!open && !actions.busy) props.onClose(); }} title={adding ? t('desktop.nodeList.addToDive.title') : node?.title ?? t('companion.browse.more')}>
    {actions.error && <p role="status" className="py-3 text-sm text-error">{t(actions.pending ? 'companion.workspace.savedRefreshError' : adding ? 'desktop.nodeList.addToDive.saveFailed' : 'companion.reading.historyError')}</p>}
    {actions.pending ? <button type="button" disabled={actions.busy} className={rowClass} onClick={actions.retryRefresh}>{t('companion.selection.refresh')}</button> : adding ? <CompanionAddToDive
      snapshot={actions.snapshot} sourceId={node?.id} disabled={disabled} onSelect={actions.addToDive} /> : mode === 'menu' ? <>
      {canUseDiveSource(node, parentKind) && menuRow(t('desktop.nodeList.menu.addToDive'), () => setMode('add-to-dive'))}
      {mutable && menuRow(t('desktop.command.rename'), () => { setMode('rename'); })}
      {mutable && canNodeBeMoved(node) && menuRow(t('desktop.command.moveToNode'), () => setMode('move'))}
      {mutable && node.kind === 'topic' && !node.anchorLink && menuRow(t(node.shelvedAt ? 'companion.workspace.unshelve' : 'companion.workspace.shelve'),
        () => void actions.execute({ type: node.shelvedAt ? 'unshelve' : 'shelve', nodeId: node.id }))}
      {childKinds.map(value => menuRow(t(value === 'folder' ? 'desktop.command.createFolder' : value === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem'),
        () => actions.open({ mode: 'create', nodeId: null, parentNodeId: node!.id })))}
      {mutable && menuRow(t('companion.workspace.delete'), () => setMode('delete'))}
      {node?.deletedAt && menuRow(t('companion.reading.restoreFromTrash'), () => void actions.execute({ type: 'restore', nodeId: node.id }))}
    </> : <CompanionWorkspaceNodeForm mode={mode} node={node} parentNodeId={props.state.parentNodeId} />}
  </CompanionBottomSheet>;
}

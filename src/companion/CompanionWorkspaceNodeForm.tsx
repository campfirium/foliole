import { useState } from 'react';

import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { assertWorkspaceMetadataParent } from '../store/workspaceNodeMetadataHistory';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export function CompanionWorkspaceNodeForm(props: { mode: 'rename' | 'move' | 'create' | 'delete'; node: WorkspaceNodeSnapshot | undefined; parentNodeId: string | null }) {
  const t = useTranslation();
  const actions = useCompanionWorkspaceActions()!;
  const { mode, node } = props;
  const [title, setTitle] = useState(mode === 'rename' ? node?.title ?? '' : '');
  const [kind, setKind] = useState<'folder' | 'topic' | 'item'>(() => actions.snapshot?.nodesById[props.parentNodeId ?? '']?.kind === 'topic' ? 'topic' : 'folder');
  const [parentId, setParentId] = useState(props.parentNodeId ?? node?.parentNodeId ?? '');
  const nodes = actions.snapshot?.nodesById ?? {};
  const disabled = actions.busy || actions.pending;
  const submit = () => {
    if (mode === 'create') void actions.execute({ type: 'create', nodeId: `node-${createCompanionUuid()}`, kind,
      title, parentNodeId: props.parentNodeId });
    else if (node && mode === 'rename') void actions.execute({ type: 'rename', nodeId: node.id, title });
    else if (node && mode === 'move') void actions.execute({ type: 'move', nodeId: node.id, parentNodeId: parentId || null });
    else if (node && mode === 'delete') void actions.execute({ type: 'delete', nodeId: node.id });
  };
  return <form onSubmit={event => { event.preventDefault(); submit(); }} className="space-y-4">
      {mode === 'delete' ? <p className="text-sm">{t('companion.workspace.deleteDescription')}</p> : mode === 'move' && node ?
        <ParentSelect node={node} nodes={nodes} disabled={disabled} value={parentId} onChange={setParentId} /> : <>
          {mode === 'create' && props.parentNodeId && <select aria-label={t('companion.workspace.kind')}
            className="min-h-11 w-full rounded border bg-companion-base p-2" value={kind} onChange={event => {
              const value = event.target.value;
              if (value === 'folder' || value === 'topic' || value === 'item') setKind(value);
            }} disabled={disabled}>
            {(['folder', 'topic', 'item'] as const).filter(value => canCreateChildNodeKind(nodes[props.parentNodeId!]?.kind ?? null, value)).map(value =>
              <option key={value} value={value}>{t(value === 'folder' ? 'desktop.command.createFolder' : value === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem')}</option>)}
          </select>}
          <label className="block text-sm">{t('companion.workspace.name')}
            <input autoFocus required className="mt-2 min-h-11 w-full rounded border bg-companion-base p-2" value={title}
              onChange={event => setTitle(event.target.value)} disabled={disabled} />
          </label>
        </>}
      <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit"
        disabled={disabled || ((mode === 'create' || mode === 'rename') && !title.trim())}>
        {t(mode === 'delete' ? 'companion.workspace.delete' : 'companion.reading.doneEditing')}</button>
    </form>;
}

function isTarget(node: WorkspaceNodeSnapshot, parentId: string, nodes: Record<string, WorkspaceNodeSnapshot>) {
  try { assertWorkspaceMetadataParent(node, parentId, nodes); return true; } catch { return false; }
}

function locationLabel(node: WorkspaceNodeSnapshot, nodes: Record<string, WorkspaceNodeSnapshot>) {
  const parts = [node.title];
  const visited = new Set([node.id]);
  let parentId = node.parentNodeId;
  while (parentId && nodes[parentId] && !visited.has(parentId)) {
    visited.add(parentId);
    parts.unshift(nodes[parentId]!.title);
    parentId = nodes[parentId]!.parentNodeId;
  }
  return parts.join(' / ');
}

function ParentSelect(props: { node: WorkspaceNodeSnapshot; nodes: Record<string, WorkspaceNodeSnapshot>; disabled: boolean; value: string; onChange(value: string): void }) {
  const { node, nodes, disabled } = props;
  const t = useTranslation();
  return <label className="block text-sm">{t('desktop.command.moveToNode')}
          <select className="mt-2 min-h-11 w-full rounded border bg-companion-base p-2" value={props.value} onChange={event => props.onChange(event.target.value)} disabled={disabled}>
            {node.kind === 'folder' && <option value="">{t('companion.workspace.root')}</option>}
            {Object.values(nodes).filter(parent => isTarget(node, parent.id, nodes)).map(parent =>
              <option key={parent.id} value={parent.id}>{locationLabel(parent, nodes)}</option>)}
          </select>
        </label>;
}

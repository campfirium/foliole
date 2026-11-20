import { useState } from 'react';

import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { MAX_DIVE_TITLE_LENGTH, readDiveNode } from '../../lib/core/nodes/dive';
import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import { isManualVirtualFolderNode } from '../../lib/core/nodes/virtualNodeFilter';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { createCompanionUuid } from '../shared/platform/companionUuid';

import { CompanionDiveSourcePicker } from './CompanionDiveSourcePicker';
import { CompanionMoveDestinationPicker } from './CompanionMoveDestinationPicker';
import { companionWorkspaceCreateLabels, useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export function CompanionWorkspaceNodeForm(props: { mode: 'rename' | 'move' | 'create' | 'create-dive' | 'create-index' | 'delete'; node: WorkspaceNodeSnapshot | undefined; parentNodeId: string | null; initialKind?: NodeKind | undefined }) {
  const t = useTranslation();
  const actions = useCompanionWorkspaceActions()!;
  const { mode, node } = props;
  const [title, setTitle] = useState(mode === 'rename' ? node?.title ?? '' : '');
  const [kind, setKind] = useState<NodeKind>(() => props.initialKind ?? (actions.snapshot?.nodesById[props.parentNodeId ?? '']?.kind === 'topic' ? 'topic' : 'folder'));
  const [parentId, setParentId] = useState(props.parentNodeId ?? node?.parentNodeId ?? '');
  const [sourceId, setSourceId] = useState('');
  const nodes = actions.snapshot?.nodesById ?? {};
  const disabled = actions.busy || actions.pending;
  const directoryLabel = mode === 'create-dive' || mode === 'create-index' ? companionWorkspaceCreateLabels[mode] : null;
  const submit = () => {
    if (mode === 'create') void actions.execute({ type: 'create', nodeId: `node-${createCompanionUuid()}`, kind,
      title, parentNodeId: props.parentNodeId });
    else if (mode === 'create-dive') void actions.execute({ type: mode, nodeId: createCompanionUuid(), title, sourceId: sourceId || null });
    else if (mode === 'create-index') void actions.execute({ type: mode, nodeId: `node-${createCompanionUuid()}`, title });
    else if (node && mode === 'rename') void actions.execute({ type: 'rename', nodeId: node.id, title });
    else if (node && mode === 'move') void actions.execute({ type: 'move', nodeId: node.id, parentNodeId: parentId || null });
    else if (node && mode === 'delete') void actions.execute({ type: 'delete', nodeId: node.id });
  };
  return <form onSubmit={event => { event.preventDefault(); submit(); }} className="space-y-4">
      {mode === 'delete' ? <p className="text-sm">{t(readDiveNode(node)
        ? 'companion.workspace.deleteDiveDescription' : isManualVirtualFolderNode(node)
          ? 'companion.workspace.deleteIndexDescription' : 'companion.workspace.deleteDescription')}</p> : mode === 'move' && node ?
        <CompanionMoveDestinationPicker node={node} nodes={nodes} disabled={disabled} value={parentId} onChange={setParentId} /> : <>
          {mode === 'create' && props.parentNodeId && <select aria-label={t('companion.workspace.kind')}
            className="min-h-11 w-full rounded border bg-companion-base p-2" value={kind} onChange={event => {
              const value = event.target.value;
              if (value === 'folder' || value === 'topic' || value === 'item') setKind(value);
            }} disabled={disabled}>
            {(['folder', 'topic', 'item'] as const).filter(value => canCreateChildNodeKind(nodes[props.parentNodeId!]?.kind ?? null, value)).map(value =>
              <option key={value} value={value}>{t(value === 'folder' ? 'desktop.command.createFolder' : value === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem')}</option>)}
          </select>}
          <label className="block text-sm">{t('companion.workspace.name')}
            <input autoFocus required maxLength={mode === 'create-dive' ? MAX_DIVE_TITLE_LENGTH : undefined}
              className="mt-2 min-h-11 w-full rounded border bg-companion-base p-2" value={title}
              onChange={event => setTitle(event.target.value)} disabled={disabled} />
          </label>
          {mode === 'create-dive' && actions.snapshot && <CompanionDiveSourcePicker snapshot={actions.snapshot}
            disabled={disabled} value={sourceId} onChange={setSourceId} />}
        </>}
      <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit"
        disabled={disabled || ((mode === 'create' || directoryLabel || mode === 'rename') && !title.trim())}>
        {t(mode === 'delete' ? 'companion.workspace.delete' : directoryLabel ?? 'companion.reading.doneEditing')}</button>
    </form>;
}

import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionBatchTarget } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';

import { CompanionAddToDive } from './CompanionAddToDive';
import { CompanionBottomSheet } from './CompanionBottomSheet';
import { CompanionMoveDestinationPicker } from './CompanionMoveDestinationPicker';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export type CompanionBatchTargetAction = 'move' | 'add-to-dive';

/** Picks where the selected rows go: a parent folder or a Dive. */
export function CompanionDirectoryBatchTargetSheet({ action, targets, onClose, onSaved }: {
  action: CompanionBatchTargetAction;
  targets: readonly CompanionBatchTarget[];
  onClose(): void;
  onSaved(): void;
}) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const [parentId, setParentId] = useState('');
  const nodes = workspace?.snapshot?.nodesById ?? {};
  const first = nodes[targets[0]?.id ?? ''];
  if (!workspace || !first) return null;
  const disabled = workspace.busy || workspace.pending;
  const ids = targets.map(target => target.id);
  const sources = ids.flatMap(id => nodes[id] ? [nodes[id]!] : []);
  const canMoveToRoot = sources.every(node => node.kind === 'folder');
  const title = t(action === 'move' ? 'companion.batch.moveTitle' : 'companion.batch.addToDiveTitle', { count: targets.length });
  return <CompanionBottomSheet open onOpenChange={open => { if (!open && !workspace.busy) onClose(); }} title={title}>
    {workspace.failure && <p role="status" className="py-3 text-sm text-error">{t(workspace.failure)}</p>}
    {action === 'move' ? <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      void workspace.moveBatch(targets, parentId || null, onSaved);
    }}>
      <CompanionMoveDestinationPicker node={first} batch={sources} nodes={nodes} disabled={disabled} value={parentId} onChange={setParentId} />
      <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit"
        disabled={disabled || (!parentId && !canMoveToRoot)}>
        {t('desktop.command.moveToNode')}</button>
    </form> : <CompanionAddToDive snapshot={workspace.snapshot} sourceId={first.id} disabled={disabled}
      onSelect={diveId => void workspace.addBatchToDive(diveId, ids, onSaved)} />}
  </CompanionBottomSheet>;
}

import { ListChecks, ListX, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { prepareCompanionBatchPurge, type CompanionBatchPurgePlan } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import {
  canMoveCompanionBatchNodeToTrash,
  type CompanionBatchTarget
} from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { AppIconButton } from '../shared/ui';

import { CompanionDirectoryBatchConfirmation } from './CompanionDirectoryBatchConfirmation';
import { useRegisterCompanionDirectoryBatchMenuAction } from './CompanionDirectoryBatchMenu';
import type { DirectoryListItem, DirectorySection } from './CompanionDirectoryModel';
import { useCompanionPageActive } from './CompanionPageStack';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

type BatchMode = 'library' | 'trash';

function listBatchCandidates(
  sections: DirectorySection[], snapshot: WorkspaceSnapshot | null, mode: BatchMode | undefined
) {
  const targets = new Map<string, CompanionBatchTarget>();
  if (!mode) return targets;
  for (const item of sections.flatMap(section => section.items)) {
    const node = snapshot?.nodesById[item.nodeId];
    const eligible = mode === 'trash' ? item.source === 'trash' && node?.deletedAt && !node.id.startsWith('special-')
      : item.source === 'internal' && canMoveCompanionBatchNodeToTrash(node);
    if (eligible && node?.currentVersionId) {
      targets.set(item.nodeId, { id: item.nodeId, version: node.currentVersionId });
    }
  }
  return targets;
}

export function useCompanionDirectoryBatchSelection(props: {
  sections: DirectorySection[];
  snapshot: WorkspaceSnapshot | null;
  batchMode?: BatchMode | undefined;
}) {
  const { sections, snapshot, batchMode } = props;
  const actions = useCompanionWorkspaceActions();
  const pageActive = useCompanionPageActive();
  const candidates = useMemo(() => listBatchCandidates(sections, snapshot, batchMode), [batchMode, sections, snapshot]);
  const [previous, setPrevious] = useState(candidates);
  const [selected, setSelected] = useState<ReadonlyMap<string, CompanionBatchTarget> | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [confirm, setConfirm] = useState<{ roots: readonly CompanionBatchTarget[]; purge: CompanionBatchPurgePlan | null } | null>(null);
  if (!pageActive && selected) {
    setSelected(null);
    setConfirm(null);
  }
  if (previous !== candidates) {
    setPrevious(candidates);
    if (pageActive && selected) setSelected(new Map([...selected].filter(([id, target]) => candidates.get(id)?.version === target.version)));
    if (confirm?.roots.some(target => candidates.get(target.id)?.version !== target.version)) setConfirm(null);
  }
  const purge = useMemo(() => batchMode === 'trash' && selected?.size
    ? prepareCompanionBatchPurge(snapshot?.nodesById ?? {}, [...selected.values()]) : null, [batchMode, selected, snapshot]);
  const busy = Boolean(actions?.busy || actions?.pending);
  const enter = useCallback(() => { setSkipped(0); setSelected(new Map()); }, []);
  useRegisterCompanionDirectoryBatchMenuAction(enter,
    pageActive && !busy && selected === null && Boolean(actions && candidates.size && isAvailableNativeCompanionRuntime()));
  return {
    trash: batchMode === 'trash', skipped, canPurge: Boolean(purge),
    active: selected !== null, busy, confirm, count: selected?.size ?? 0, total: candidates.size,
    exit: () => { setSelected(null); setConfirm(null); },
    selectAll: () => setSelected(candidates),
    clear: () => setSelected(new Map()),
    openConfirmation: () => {
      if (selected?.size && (batchMode !== 'trash' || purge)) setConfirm({ roots: [...selected.values()], purge });
    },
    cancelConfirmation: () => setConfirm(null),
    acceptConfirmation: () => {
      if (!confirm || !actions) return;
      setConfirm(null);
      const closeSelection = () => setSelected(null);
      if (confirm.purge) void actions.purgeBatch(confirm.purge, closeSelection);
      else void actions.moveBatchToTrash(confirm.roots, closeSelection);
    },
    restore: () => {
      if (!selected?.size || !actions) return;
      void actions.restoreBatch([...selected.values()], count => { setSkipped(count); setSelected(null); });
    },
    rowSelection: (item: DirectoryListItem) => selected && candidates.has(item.nodeId)
      ? { checked: selected.has(item.nodeId), toggle: () => setSelected(toggleBatchTarget(selected, candidates.get(item.nodeId)!)) } : null
  };
}

function toggleBatchTarget(selected: ReadonlyMap<string, CompanionBatchTarget>, target: CompanionBatchTarget) {
  const next = new Map(selected);
  if (!next.delete(target.id)) next.set(target.id, target);
  return next;
}

export function CompanionDirectoryBatchControls({ batch }: { batch: ReturnType<typeof useCompanionDirectoryBatchSelection> }) {
  const t = useTranslation();
  if (!batch.active) return batch.skipped > 0 && <p role="status" className="pb-2 text-sm">
    {t('companion.batch.restoreSkipped', { count: batch.skipped })}
  </p>;
  const allSelected = batch.count === batch.total;
  const selectionLabel = t(allSelected ? 'companion.batch.clear' : 'companion.batch.selectAll');
  const trashLabel = t(batch.trash ? 'desktop.nodeList.menu.deletePermanently' : 'companion.workspace.delete');
  const restoreLabel = t('desktop.nodeList.menu.restore');
  const SelectionIcon = allSelected ? ListX : ListChecks;
  return <div className="sticky top-[calc(max(env(safe-area-inset-top),4px)+3rem)] z-10 border-b border-companion-divider bg-companion-base">
    <div className="flex min-h-11 items-center">
      <AppIconButton className="size-11" label={t('shared.confirm.cancel')} disabled={batch.busy}
        icon={<X size={20} aria-hidden="true" />} onClick={batch.exit} />
      <span role="status" className="min-w-0 flex-1 px-1 text-sm tabular-nums">
        <span className="sr-only">{t('companion.batch.count', { count: batch.count, total: batch.total })}</span>
        <span aria-hidden="true">{batch.count}/{batch.total}</span>
      </span>
      <AppIconButton className="size-11" label={selectionLabel} title={selectionLabel}
        icon={<SelectionIcon size={20} aria-hidden="true" />}
        onClick={allSelected ? batch.clear : batch.selectAll} disabled={batch.busy || !batch.total} />
      {batch.trash && <AppIconButton className="size-11" label={restoreLabel} title={restoreLabel}
        icon={<RotateCcw size={19} aria-hidden="true" />} disabled={!batch.count || batch.busy}
        onClick={batch.restore} />}
      <AppIconButton className="size-11" label={trashLabel} title={trashLabel}
        icon={<Trash2 size={19} aria-hidden="true" />} disabled={batch.busy || (batch.trash ? !batch.canPurge : !batch.count)}
        onClick={batch.openConfirmation} />
    </div>
    {batch.trash && batch.count > 0 && !batch.canPurge && <p className="pb-2 text-sm text-companion-text-secondary">
      {t('companion.batch.purgeUnavailable')}
    </p>}
    {batch.confirm && <CompanionDirectoryBatchConfirmation
      count={batch.confirm.roots.length} total={batch.confirm.purge?.entries.length}
      onCancel={batch.cancelConfirmation} onConfirm={batch.acceptConfirmation} />}
  </div>;
}

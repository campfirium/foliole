import { useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { prepareCompanionBatchPurge, type CompanionBatchPurgePlan } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import {
  canMoveCompanionBatchNodeToTrash,
  type CompanionBatchTarget
} from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { AppButton } from '../shared/ui';

import { CompanionDirectoryBatchConfirmation } from './CompanionDirectoryBatchConfirmation';
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
  return {
    available: Boolean(actions && isAvailableNativeCompanionRuntime() && candidates.size),
    trash: batchMode === 'trash', skipped, canPurge: Boolean(purge),
    active: selected !== null, busy, confirm, count: selected?.size ?? 0, total: candidates.size,
    enter: () => { setSkipped(0); setSelected(new Map()); },
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
  if (!batch.active) return <div className="flex flex-wrap items-center justify-end gap-2 empty:hidden">
    {batch.skipped > 0 && <p role="status" className="mr-auto text-sm">
      {t('companion.batch.restoreSkipped', { count: batch.skipped })}
    </p>}
    {batch.available && <AppButton className="min-h-11" variant="ghost" onClick={batch.enter} disabled={batch.busy}>
      {t('companion.batch.select')}
    </AppButton>}
  </div>;
  return <div className="sticky top-[calc(max(env(safe-area-inset-top),4px)+3rem)] z-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-companion-divider bg-companion-base pb-2">
    <span role="status" className="mr-auto min-w-0 text-sm">
      {t('companion.batch.count', { count: batch.count, total: batch.total })}
    </span>
    <AppButton className="min-h-11" variant="ghost" onClick={batch.count === batch.total ? batch.clear : batch.selectAll}
      disabled={batch.busy || !batch.total}>
      {t(batch.count === batch.total ? 'companion.batch.clear' : 'companion.batch.selectAll')}
    </AppButton>
    <AppButton className="min-h-11" variant="ghost" onClick={batch.exit} disabled={batch.busy}>
      {t('shared.confirm.cancel')}
    </AppButton>
    <AppButton className="min-h-11 whitespace-normal" disabled={!batch.count || batch.busy} onClick={batch.trash ? batch.restore : batch.openConfirmation}>
      {t(batch.trash ? 'desktop.nodeList.menu.restore' : 'companion.workspace.delete')}
    </AppButton>
    {batch.trash && <AppButton className="min-h-11 whitespace-normal" variant="ghost"
      disabled={!batch.canPurge || batch.busy} onClick={batch.openConfirmation}>
      {t('desktop.nodeList.menu.deletePermanently')}
    </AppButton>}
    {batch.trash && batch.count > 0 && !batch.canPurge && <p className="basis-full text-sm text-companion-text-secondary">
      {t('companion.batch.purgeUnavailable')}
    </p>}
    {batch.confirm && <CompanionDirectoryBatchConfirmation
      count={batch.confirm.roots.length} total={batch.confirm.purge?.entries.length}
      onCancel={batch.cancelConfirmation} onConfirm={batch.acceptConfirmation} />}
  </div>;
}

import { useCallback, useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { prepareCompanionBatchPurge, type CompanionBatchPurgePlan } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import {
  canMoveCompanionBatchNodeToTrash,
  type CompanionBatchTarget
} from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionDirectoryBatchConfirmation } from './CompanionDirectoryBatchConfirmation';
import { useCompanionDirectoryBatchHeader, useRegisterCompanionDirectoryBatchMenuAction } from './CompanionDirectoryBatchMenu';
import type { DirectoryListItem, DirectorySection } from './CompanionDirectoryModel';
import { CompanionListSelectionControls } from './CompanionListSelectionControls';
import { useCompanionPageActive } from './CompanionPageStack';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

export type CompanionListBatchMode = 'library' | 'trash' | 'dive';

function listBatchCandidates(
  sections: DirectorySection[], snapshot: WorkspaceSnapshot | null, mode: CompanionListBatchMode | undefined
) {
  const targets = new Map<string, CompanionBatchTarget>();
  if (!mode) return targets;
  for (const item of sections.flatMap(section => section.items)) {
    const node = snapshot?.nodesById[item.nodeId];
    const eligible = mode === 'trash' ? item.source === 'trash' && node?.deletedAt && !node.id.startsWith('special-')
      : item.source === 'internal' && (mode === 'dive' ? Boolean(item.directDiveId) : canMoveCompanionBatchNodeToTrash(node));
    if (eligible && node?.currentVersionId) {
      targets.set(item.nodeId, { id: item.nodeId, version: node.currentVersionId });
    }
  }
  return targets;
}

function getTrashFolderRestore(
  item: DirectoryListItem,
  snapshot: WorkspaceSnapshot | null,
  candidates: ReadonlyMap<string, CompanionBatchTarget>,
  restoreTargets: (targets: readonly CompanionBatchTarget[], onSaved: () => void) => void
) {
  if (item.kind !== 'folder' || item.source !== 'trash' || snapshot?.nodesById[item.nodeId]?.virtualFilter) return undefined;
  const target = candidates.get(item.nodeId);
  return target && isAvailableNativeCompanionRuntime() ? (onSaved: () => void) => restoreTargets([target], onSaved) : undefined;
}

export function useCompanionDirectoryBatchSelection(props: {
  sections: DirectorySection[];
  snapshot: WorkspaceSnapshot | null;
  batchMode?: CompanionListBatchMode | undefined;
  diveId?: string | undefined;
}) {
  const { sections, snapshot, batchMode } = props;
  const actions = useCompanionWorkspaceActions();
  const pageActive = useCompanionPageActive();
  const candidates = useMemo(() => listBatchCandidates(sections, snapshot, batchMode), [batchMode, sections, snapshot]);
  const [previous, setPrevious] = useState(candidates);
  const [selected, setSelected] = useState<ReadonlyMap<string, CompanionBatchTarget> | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [confirm, setConfirm] = useState<{ roots: readonly CompanionBatchTarget[]; purge: CompanionBatchPurgePlan | null } | null>(null);
  function closeSelection() {
    setSelected(null);
    setConfirm(null);
  }
  if (!pageActive && selected) closeSelection();
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
  useCompanionDirectoryBatchHeader(pageActive && selected !== null);
  const restoreTargets = (targets: readonly CompanionBatchTarget[], onSaved: () => void) => {
    void actions?.restoreBatch(targets, count => { setSkipped(count); onSaved(); });
  };
  return {
    mode: batchMode, skipped, canPurge: Boolean(purge),
    active: selected !== null, busy, confirm, count: selected?.size ?? 0, total: candidates.size,
    exit: closeSelection,
    selectAll: () => setSelected(candidates),
    clear: () => setSelected(new Map()),
    openConfirmation: () => {
      if (selected?.size && (batchMode !== 'trash' || purge)) setConfirm({ roots: [...selected.values()], purge });
    },
    cancelConfirmation: () => setConfirm(null),
    acceptConfirmation: () => {
      if (!confirm || !actions) return;
      setConfirm(null);
      if (confirm.purge) void actions.purgeBatch(confirm.purge, closeSelection);
      else void actions.moveBatchToTrash(confirm.roots, closeSelection);
    },
    restore: () => applyToBatch(selected, targets => restoreTargets(targets, closeSelection)),
    removeFromDive: () => applyToBatch(selected, targets => {
      if (props.diveId) actions?.removeFromDive(props.diveId, targets.map(target => target.id), closeSelection);
    }),
    restoreFolderAction: (item: DirectoryListItem) => !selected && actions
      ? getTrashFolderRestore(item, snapshot, candidates, restoreTargets) : undefined,
    rowSelection: (item: DirectoryListItem) => selected && candidates.has(item.nodeId)
      ? { checked: selected.has(item.nodeId), toggle: () => setSelected(toggleBatchTarget(selected, candidates.get(item.nodeId)!)) } : null
  };
}

function applyToBatch(
  selected: ReadonlyMap<string, CompanionBatchTarget> | null,
  run: (targets: CompanionBatchTarget[]) => void
) {
  if (selected?.size) run([...selected.values()]);
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
  const trash = batch.mode === 'trash';
  const deleteAction = {
    label: t(trash ? 'desktop.nodeList.menu.deletePermanently' : 'companion.workspace.delete'),
    destructive: trash,
    disabled: trash && !batch.canPurge,
    onSelect: batch.openConfirmation
  };
  const actions = batch.mode === 'dive'
    ? [{ label: t('desktop.nodeList.menu.removeFromDive'), onSelect: batch.removeFromDive }]
    : trash ? [{ label: t('desktop.nodeList.menu.restore'), onSelect: batch.restore }, deleteAction] : [deleteAction];

  return <>
    <CompanionListSelectionControls
      count={batch.count} total={batch.total} busy={batch.busy}
      onCancel={batch.exit} onSelectAll={batch.selectAll} onClear={batch.clear} actions={actions}
      notice={trash && batch.count > 0 && !batch.canPurge && <p className="px-1 pb-2 text-sm text-companion-text-secondary">
        {t('companion.batch.purgeUnavailable')}
      </p>}
    />
    {batch.confirm && <CompanionDirectoryBatchConfirmation
      count={batch.confirm.roots.length} total={batch.confirm.purge?.entries.length}
      onCancel={batch.cancelConfirmation} onConfirm={batch.acceptConfirmation} />}
  </>;
}

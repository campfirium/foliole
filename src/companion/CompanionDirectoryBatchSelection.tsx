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
import {
  useCompanionDirectoryBatchHeader,
  useRegisterCompanionDirectoryBatchMenuAction,
  useRegisterCompanionEmptyTrashAction
} from './CompanionDirectoryBatchMenu';
import { CompanionDirectoryBatchTargetSheet, type CompanionBatchTargetAction } from './CompanionDirectoryBatchTargetSheet';
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

type BatchTargets = ReadonlyMap<string, CompanionBatchTarget>;
type BatchConfirm = { roots: readonly CompanionBatchTarget[]; purge: CompanionBatchPurgePlan | null } | null;

function useBatchMenuEntries(args: {
  candidates: BatchTargets; snapshot: WorkspaceSnapshot | null; available: boolean; trashRoot: boolean;
  setSelected(value: BatchTargets | null): void; setConfirm(value: BatchConfirm): void; setSkipped(value: number): void;
}) {
  const { candidates, snapshot, setSelected, setConfirm, setSkipped } = args;
  const enter = useCallback(() => { setSkipped(0); setSelected(new Map()); }, [setSelected, setSkipped]);
  useRegisterCompanionDirectoryBatchMenuAction(enter, args.available);
  const emptyTrash = useCallback(() => {
    setSkipped(0);
    setSelected(candidates);
    const plan = prepareCompanionBatchPurge(snapshot?.nodesById ?? {}, [...candidates.values()]);
    if (plan) setConfirm({ roots: [...candidates.values()], purge: plan });
  }, [candidates, snapshot, setConfirm, setSelected, setSkipped]);
  useRegisterCompanionEmptyTrashAction(emptyTrash, args.trashRoot && args.available);
}

function batchWrites(args: {
  actions: ReturnType<typeof useCompanionWorkspaceActions>; confirm: BatchConfirm; selected: BatchTargets | null;
  diveId: string | undefined; setConfirm(value: BatchConfirm): void; closeSelection(): void;
  restoreTargets(targets: readonly CompanionBatchTarget[], onSaved: () => void): void;
}) {
  const { actions, confirm, closeSelection } = args;
  return {
    acceptConfirmation: () => {
      if (!confirm || !actions) return;
      args.setConfirm(null);
      if (confirm.purge) void actions.purgeBatch(confirm.purge, closeSelection);
      else void actions.moveBatchToTrash(confirm.roots, closeSelection);
    },
    restore: () => applyToBatch(args.selected, targets => args.restoreTargets(targets, closeSelection)),
    removeFromDive: () => applyToBatch(args.selected, targets => {
      if (args.diveId) actions?.removeFromDive(args.diveId, targets.map(target => target.id), closeSelection);
    })
  };
}

export function useCompanionDirectoryBatchSelection(props: {
  sections: DirectorySection[];
  snapshot: WorkspaceSnapshot | null;
  batchMode?: CompanionListBatchMode | undefined;
  diveId?: string | undefined;
  trashRoot?: boolean | undefined;
}) {
  const { sections, snapshot, batchMode } = props;
  const actions = useCompanionWorkspaceActions();
  const pageActive = useCompanionPageActive();
  const candidates = useMemo(() => listBatchCandidates(sections, snapshot, batchMode), [batchMode, sections, snapshot]);
  const [previous, setPrevious] = useState(candidates);
  const [selected, setSelected] = useState<ReadonlyMap<string, CompanionBatchTarget> | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [confirm, setConfirm] = useState<{ roots: readonly CompanionBatchTarget[]; purge: CompanionBatchPurgePlan | null } | null>(null);
  const [target, setTarget] = useState<CompanionBatchTargetAction | null>(null);
  function closeSelection() {
    setSelected(null);
    setConfirm(null);
    setTarget(null);
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
  useBatchMenuEntries({ candidates, snapshot, setSelected, setConfirm, setSkipped, trashRoot: Boolean(props.trashRoot) && batchMode === 'trash',
    available: pageActive && !busy && selected === null && Boolean(actions && candidates.size && isAvailableNativeCompanionRuntime()) });
  useCompanionDirectoryBatchHeader(pageActive && selected !== null);
  const restoreTargets = (targets: readonly CompanionBatchTarget[], onSaved: () => void) => {
    void actions?.restoreBatch(targets, count => { setSkipped(count); onSaved(); });
  };
  return {
    mode: batchMode, skipped, canPurge: Boolean(purge),
    active: selected !== null, busy, confirm, count: selected?.size ?? 0, total: candidates.size,
    lockedRows: sections.reduce((count, section) => count + section.items.length, 0) > candidates.size,
    exit: closeSelection,
    finish: closeSelection,
    selectAll: () => setSelected(candidates),
    clear: () => setSelected(new Map()),
    openConfirmation: () => {
      if (selected?.size && (batchMode !== 'trash' || purge)) setConfirm({ roots: [...selected.values()], purge });
    },
    cancelConfirmation: () => setConfirm(null),
    target, targets: [...(selected?.values() ?? [])],
    openTarget: (action: CompanionBatchTargetAction) => { if (selected?.size) setTarget(action); },
    closeTarget: () => setTarget(null),
    ...batchWrites({ actions, confirm, selected, diveId: props.diveId, setConfirm, closeSelection, restoreTargets }),
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
    : trash ? [{ label: t('desktop.nodeList.menu.restore'), onSelect: batch.restore }, deleteAction]
      : [{ label: t('companion.batch.move'), onSelect: () => batch.openTarget('move') },
        { label: t('companion.batch.addToDive'), onSelect: () => batch.openTarget('add-to-dive') }, deleteAction];

  return <>
    <CompanionListSelectionControls
      count={batch.count} total={batch.total} busy={batch.busy}
      onCancel={batch.exit} onSelectAll={batch.selectAll} onClear={batch.clear} actions={actions}
      notice={trash && batch.count > 0 && !batch.canPurge ? <p className="px-1 pb-2 text-sm text-companion-text-secondary">
        {t('companion.batch.purgeUnavailable')}
      </p> : batch.mode === 'dive' && batch.lockedRows ? <p className="px-1 pb-2 text-sm text-companion-text-secondary">
        {t('companion.batch.diveScope')}
      </p> : null}
    />
    {batch.confirm && <CompanionDirectoryBatchConfirmation
      count={batch.confirm.roots.length} total={batch.confirm.purge?.entries.length}
      onCancel={batch.cancelConfirmation} onConfirm={batch.acceptConfirmation} />}
    {batch.target && <CompanionDirectoryBatchTargetSheet action={batch.target} targets={batch.targets}
      onClose={batch.closeTarget} onSaved={batch.finish} />}
  </>;
}

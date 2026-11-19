import { createContext, useContext, useState, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { addCompanionDiveSource, removeCompanionDiveSource } from '../shared/platform/companion/runtime/companionDiveSources';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { purgeCompanionTrashBatch, type CompanionBatchPurgePlan } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash, type CompanionBatchTarget } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import type { WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';
import { CompanionWorkspaceNodeSheet, type WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';
import { useCompanionWorkspaceHistoryAvailability, useCompanionWorkspaceTransaction } from './useCompanionWorkspaceHistory';

type Mode = 'undo' | 'redo';
type Actions = {
  snapshot: WorkspaceSnapshot | null; flowActive: boolean; busy: boolean; pending: boolean; error: boolean; canUndo: boolean; canRedo: boolean;
  open(state: WorkspaceNodeSheetState): void; execute(command: WorkspaceMetadataCommand, onSaved?: () => void): Promise<void>;
  convertDirectory(nodeId: string, target: DiveDirectoryConversionTarget, expectedFilter: string): void;
  addToDive(diveId: string, sourceId: string): void;
  removeFromDive(diveId: string, sourceId: string, onSaved: () => void): void;
  moveBatchToTrash(targets: readonly CompanionBatchTarget[], onSaved: () => void): Promise<void>;
  restoreBatch(targets: readonly CompanionBatchTarget[], onSaved: (skipped: number) => void): Promise<void>;
  purgeBatch(plan: CompanionBatchPurgePlan, onSaved: () => void): Promise<void>;
  replay(mode: Mode): void;
  retryRefresh(): void;
};
const Context = createContext<Actions | null>(null);
export const useCompanionWorkspaceActions = () => useContext(Context);

export function CompanionWorkspaceActionsProvider(props: {
  children: ReactNode; snapshot: WorkspaceSnapshot | null; refresh(): Promise<unknown>;
  flush(): Promise<unknown>; restoreFlow(session: ReviewSessionState): void;
  captureFlow?: () => { session: ReviewSessionState; mode: ReviewSessionMode };
  flowActive: boolean; applyFlow(mode: Mode): Promise<void>;
}) {
  const t = useTranslation();
  const [sheet, setSheet] = useState<WorkspaceNodeSheetState | null>(null);
  const key = companionFlowHistoryKey(props.snapshot?.libraryScope ?? '');
  const availability = useCompanionWorkspaceHistoryAvailability(key);
  const { run, busy, pending, error, failure } = useCompanionWorkspaceTransaction({ ...props, afterRefresh: () => setSheet(null) });
  async function replay(mode: Mode) {
    if (props.flowActive && !pending) { await props.applyFlow(mode); return; }
    await run(async () => {
      const history = await loadCompanionFlowHistory(key);
      const stack = mode === 'undo' ? history.undoStack : history.redoStack;
      const entry = stack.at(-1);
      if (!entry) return;
      const source = entry.type === 'nodes.change' ? createEmptyReviewSession() :
        (mode === 'undo' ? entry.afterContext : entry.beforeContext).reviewSession;
      const restored = await replayCompanionFlowHistory(key, mode, source);
      if (restored && (entry.type !== 'nodes.change' || entry.beforeSession)) props.restoreFlow(restored);
    });
  }
  const actions: Actions = { snapshot: props.snapshot, flowActive: props.flowActive, busy, pending, error, ...availability, open: setSheet,
    convertDirectory: (nodeId, target, expectedFilter) => void run(() => convertCompanionDiveDirectory(nodeId, target, expectedFilter)),
    addToDive: (diveId, sourceId) => void run(() => addCompanionDiveSource(diveId, sourceId)),
    removeFromDive: (diveId, sourceId, onSaved) => void run(() => removeCompanionDiveSource(diveId, sourceId), onSaved),
    moveBatchToTrash: (targets, onSaved) => run(async () => { await moveCompanionBatchToTrash(targets); }, onSaved, 'companion.batch.error'),
    restoreBatch: (targets, onSaved) => {
      let skipped = 0;
      return run(async () => {
        const result = await restoreCompanionBatchFromTrash(targets);
        skipped = result.skippedConflicts.length;
      }, () => onSaved(skipped), 'companion.batch.error');
    },
    purgeBatch: (plan, onSaved) => run(async () => { await purgeCompanionTrashBatch(plan); }, onSaved, 'companion.batch.error'),
    retryRefresh: () => void run(async () => {}),
    execute: (command, onSaved) => run(async () => {
      await mutateCompanionWorkspace(command, command.type === 'set-priority' ? undefined : props.captureFlow?.());
    }, onSaved), replay: mode => void replay(mode) };
  return <Context.Provider value={actions}>
    {props.children}
    {failure && !sheet && <div role="status" className="fixed bottom-24 left-3 right-3 z-[80] rounded-lg border bg-companion-base p-3 text-sm">
      {t(pending ? 'companion.workspace.savedRefreshError' : failure)}
      {pending && <button type="button" disabled={busy} className="ml-3 min-h-11 underline" onClick={() => void run(async () => {})}>
        {t('companion.selection.refresh')}</button>}
    </div>}
    {sheet && <CompanionWorkspaceNodeSheet key={JSON.stringify(sheet)} state={sheet} onClose={() => setSheet(null)} />}
  </Context.Provider>;
}

export function CompanionWorkspaceHistoryActions() {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  if (!actions || !isAvailableNativeCompanionRuntime()) return null;
  return <div className="flex gap-3 border-b border-companion-divider py-2">
    {(['undo', 'redo'] as const).map(mode => <button key={mode} type="button"
      disabled={actions.busy || actions.pending || !(mode === 'undo' ? actions.canUndo : actions.canRedo)}
      className="min-h-11 flex-1 text-sm disabled:opacity-40" onClick={() => actions.replay(mode)}>
      {t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo')}</button>)}
  </div>;
}

const companionWorkspaceCreateChoices = [
  { mode: 'create', label: 'companion.directory.row.folder' },
  { mode: 'create-dive', label: 'desktop.nodeList.dive.tree' },
  { mode: 'create-index', label: 'companion.directory.section.virtual' }
] as const;

export function CompanionWorkspaceCreateChoices({ onSelect }: { onSelect(): void }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  if (!actions || !isAvailableNativeCompanionRuntime()) return null;
  return <>{companionWorkspaceCreateChoices.map(({ mode, label }) => <button key={mode} type="button"
    className={companionWorkspaceRowClass} disabled={actions.busy || actions.pending}
    onClick={() => {
      onSelect();
      actions.open({ mode, nodeId: null, parentNodeId: null });
    }}>
    {t(label)}
  </button>)}</>;
}

export const companionWorkspaceCreateLabels = {
  create: 'desktop.command.createFolder',
  'create-dive': 'desktop.nodeList.dive.create',
  'create-index': 'desktop.nodeList.createVirtualFolder'
} as const;

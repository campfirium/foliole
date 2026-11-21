import { createContext, useContext, useState, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../shared/localization/translations';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { addCompanionDiveSource, addCompanionDiveSources, removeCompanionDiveSources } from '../shared/platform/companion/runtime/companionDiveSources';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey, type CompanionHistoryTop } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { changeCompanionIndexSource, type CompanionIndexSourceChange } from '../shared/platform/companion/runtime/companionIndexSources';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { purgeCompanionTrashBatch, type CompanionBatchPurgePlan } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash, type CompanionBatchTarget } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import type { WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { resolveCompanionHistoryLabel } from './companionHistoryActionLabel';
import { CompanionMenuRow } from './CompanionMenuSheet';
import { previewCompanionTrash } from './companionTrashPreview';
import { CompanionWorkspaceNodeSheet, type WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';
import { useCompanionWorkspaceHistoryAvailability, useCompanionWorkspaceTransaction } from './useCompanionWorkspaceHistory';

type Mode = 'undo' | 'redo';
type Actions = {
  snapshot: WorkspaceSnapshot | null; flowActive: boolean; busy: boolean; pending: boolean; failure: TranslationKey | null; canUndo: boolean; canRedo: boolean;
  undoTop: CompanionHistoryTop; redoTop: CompanionHistoryTop;
  open(state: WorkspaceNodeSheetState): void; execute(command: WorkspaceMetadataCommand, onSaved?: () => void): Promise<void>;
  convertDirectory(nodeId: string, target: DiveDirectoryConversionTarget, expectedFilter: string): void;
  addToDive(diveId: string, sourceId: string): void;
  removeFromDive(diveId: string, sourceIds: readonly string[], onSaved: () => void): void;
  changeIndexSource(indexId: string, sourceId: string, change: CompanionIndexSourceChange): void;
  moveBatchToTrash(targets: readonly CompanionBatchTarget[], onSaved: () => void): Promise<void>;
  moveBatch(targets: readonly CompanionBatchTarget[], parentNodeId: string | null, onSaved: () => void): Promise<void>;
  addBatchToDive(diveId: string, sourceIds: readonly string[], onSaved: () => void): Promise<void>;
  restoreBatch(targets: readonly CompanionBatchTarget[], onSaved: (skipped: number) => void): Promise<void>;
  purgeBatch(plan: CompanionBatchPurgePlan, onSaved: () => void): Promise<void>;
  replay(mode: Mode): void;
  retryRefresh(): void;
};
const Context = createContext<Actions | null>(null);
export { Context as CompanionWorkspaceActionsContext };
export const useCompanionWorkspaceActions = () => useContext(Context);

const metadataFailureKeys = {
  'create-dive': 'companion.workspace.failure.createDive',
  'create-index': 'companion.workspace.failure.createIndex',
  'set-priority': 'companion.workspace.failure.priority',
  rename: 'companion.workspace.failure.rename',
  move: 'companion.workspace.failure.move',
  delete: 'companion.workspace.failure.trash',
  restore: 'companion.workspace.failure.restore',
  shelve: 'companion.workspace.failure.shelve',
  unshelve: 'companion.workspace.failure.unshelve'
} as const satisfies Record<Exclude<WorkspaceMetadataCommand['type'], 'create'>, TranslationKey>;

const createFailureKeys = {
  folder: 'companion.workspace.failure.createFolder',
  topic: 'companion.workspace.failure.createTopic',
  item: 'companion.workspace.failure.createItem'
} as const;

type TransactionRun = ReturnType<typeof useCompanionWorkspaceTransaction>['run'];

function createBatchWriteActions(run: TransactionRun): Pick<Actions, 'moveBatchToTrash' | 'moveBatch' | 'addBatchToDive' | 'purgeBatch'> {
  return {
    moveBatchToTrash: (targets, onSaved) => run(async () => { await moveCompanionBatchToTrash(targets); }, onSaved, 'companion.batch.error',
      () => { const withdraw = previewCompanionTrash(targets.map(target => target.id)); onSaved(); return withdraw; }),
    moveBatch: (targets, parentNodeId, onSaved) => run(async () => { await moveCompanionBatch(targets, parentNodeId); }, onSaved, 'companion.batch.error'),
    addBatchToDive: (diveId, sourceIds, onSaved) => run(() => addCompanionDiveSources(diveId, sourceIds), onSaved,
      'desktop.nodeList.addToDive.saveFailed'),
    purgeBatch: (plan, onSaved) => run(async () => { await purgeCompanionTrashBatch(plan); }, onSaved, 'companion.batch.error')
  };
}

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
  const { run, busy, pending, failure, clearFailure } = useCompanionWorkspaceTransaction({ ...props, afterRefresh: () => setSheet(null) });
  const open = (state: WorkspaceNodeSheetState | null) => {
    if (!pending) clearFailure();
    setSheet(state);
  };
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
  const actions: Actions = { snapshot: props.snapshot, flowActive: props.flowActive, busy, pending, failure, ...availability, open,
    convertDirectory: (nodeId, target, expectedFilter) => void run(() => convertCompanionDiveDirectory(nodeId, target, expectedFilter),
      undefined, 'desktop.nodeList.dive.convertFailed'),
    addToDive: (diveId, sourceId) => void run(() => addCompanionDiveSource(diveId, sourceId), undefined, 'desktop.nodeList.addToDive.saveFailed'),
    removeFromDive: (diveId, sourceIds, onSaved) => void run(() => removeCompanionDiveSources(diveId, sourceIds), onSaved,
      'companion.workspace.failure.removeDiveSource'),
    ...createBatchWriteActions(run),
    changeIndexSource: (indexId, sourceId, change) => void run(() => changeCompanionIndexSource(indexId, sourceId, change),
      undefined, change === 'add' ? 'companion.index.addSourceFailed' : 'companion.index.removeSourceFailed'),
    restoreBatch: (targets, onSaved) => {
      let skipped = 0;
      return run(async () => {
        const result = await restoreCompanionBatchFromTrash(targets);
        skipped = result.skippedConflicts.length;
      }, () => onSaved(skipped), targets.length === 1 ? 'companion.workspace.failure.restore' : 'companion.batch.error');
    },
    retryRefresh: () => void run(async () => {}),
    execute: (command, onSaved) => run(async () => {
      await mutateCompanionWorkspace(command, command.type === 'set-priority' ? undefined : props.captureFlow?.());
    }, onSaved, command.type === 'create' ? createFailureKeys[command.kind] : metadataFailureKeys[command.type],
    command.type === 'delete' ? () => { const withdraw = previewCompanionTrash([command.nodeId]); setSheet(null); return withdraw; } : undefined),
    replay: mode => void replay(mode) };
  return <Context.Provider value={actions}>
    {props.children}
    {failure && !sheet && <div role="status" className="fixed bottom-24 left-3 right-3 z-[80] rounded-lg border bg-companion-base p-3 text-sm">
      {t(pending ? 'companion.workspace.savedRefreshError' : failure)}
      {pending && <button type="button" disabled={busy} className="ml-3 min-h-11 underline" onClick={() => void run(async () => {})}>
        {t('companion.selection.refresh')}</button>}
    </div>}
    {sheet && <CompanionWorkspaceNodeSheet key={JSON.stringify(sheet)} state={sheet} onClose={() => open(null)} />}
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
      {resolveCompanionHistoryLabel(mode, mode === 'undo' ? actions.undoTop : actions.redoTop, t)}</button>)}
  </div>;
}

const companionWorkspaceCreateModes = ['create', 'create-dive', 'create-index'] as const;

/** Root-level creation rows, shown under the library root's "New Here…" menu view. */
export function CompanionWorkspaceCreateChoices({ onSelect }: { onSelect(): void }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  if (!actions || !isAvailableNativeCompanionRuntime()) return null;
  return <>{companionWorkspaceCreateModes.map(mode => <CompanionMenuRow key={mode}
    disabled={actions.busy || actions.pending}
    label={t(companionWorkspaceCreateLabels[mode])}
    onSelect={() => {
      onSelect();
      actions.open({ mode, nodeId: null, parentNodeId: null });
    }} />)}</>;
}

export const companionWorkspaceCreateLabels = {
  create: 'desktop.command.createFolder',
  'create-dive': 'desktop.nodeList.dive.create',
  'create-index': 'desktop.nodeList.createVirtualFolder'
} as const;

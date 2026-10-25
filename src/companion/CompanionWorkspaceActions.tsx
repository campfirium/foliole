import { createContext, useContext, useState, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import type { WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { CompanionWorkspaceNodeSheet, type WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';
import { useCompanionWorkspaceHistoryAvailability, useCompanionWorkspaceTransaction } from './useCompanionWorkspaceHistory';

type Mode = 'undo' | 'redo';
type Actions = {
  snapshot: WorkspaceSnapshot | null; currentNodeId: string | null; busy: boolean; pending: boolean; error: boolean; canUndo: boolean; canRedo: boolean;
  open(state: WorkspaceNodeSheetState): void; execute(command: WorkspaceMetadataCommand): Promise<void>;
  replay(mode: Mode): void;
  retryRefresh(): void;
};
const Context = createContext<Actions | null>(null);
export const useCompanionWorkspaceActions = () => useContext(Context);

export function CompanionWorkspaceActionsProvider(props: {
  children: ReactNode; snapshot: WorkspaceSnapshot | null; refresh(): Promise<unknown>;
  currentNodeId?: string | null;
  flush(): Promise<unknown>; restoreFlow(session: ReviewSessionState): void;
  captureFlow?: () => { session: ReviewSessionState; mode: ReviewSessionMode };
  flowActive: boolean; applyFlow(mode: Mode): Promise<void>;
}) {
  const t = useTranslation();
  const [sheet, setSheet] = useState<WorkspaceNodeSheetState | null>(null);
  const key = companionFlowHistoryKey(props.snapshot?.libraryScope ?? '');
  const availability = useCompanionWorkspaceHistoryAvailability(key);
  const { run, busy, pending, error } = useCompanionWorkspaceTransaction({ ...props, afterRefresh: () => setSheet(null) });
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
  const actions: Actions = { snapshot: props.snapshot, currentNodeId: props.currentNodeId ?? null, busy, pending, error, ...availability, open: setSheet,
    retryRefresh: () => void run(async () => {}),
    execute: command => run(async () => { await mutateCompanionWorkspace(command, props.captureFlow?.()); }), replay: mode => void replay(mode) };
  return <Context.Provider value={actions}>
    {props.children}
    {error && !sheet && <div role="status" className="fixed bottom-24 left-3 right-3 z-[80] rounded-lg border bg-companion-base p-3 text-sm">
      {t(pending ? 'companion.workspace.savedRefreshError' : 'companion.reading.historyError')}
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

export function CompanionWorkspaceCreateAction() {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  if (!actions || !isAvailableNativeCompanionRuntime()) return null;
  return <button type="button" className="min-h-11 w-full border-b border-companion-divider text-left" disabled={actions.busy || actions.pending}
    onClick={() => actions.open({ mode: 'create', nodeId: null, parentNodeId: null })}>{t('desktop.command.createFolder')}</button>;
}

export function CompanionWorkspaceCurrentNodeAction(props: { onSelect(): void }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  if (!actions?.currentNodeId || !isAvailableNativeCompanionRuntime()) return null;
  return <button type="button" className="min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm"
    disabled={actions.busy || actions.pending} onClick={() => {
      props.onSelect();
      actions.open({ mode: 'menu', nodeId: actions.currentNodeId, parentNodeId: null });
    }}>{t('companion.workspace.manage')}</button>;
}

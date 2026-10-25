import { Redo2, Undo2 } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { subscribeCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import type { HistoryMode } from '../store/workspaceReviewHistoryTarget';

import { CompanionEditHistoryActions, type CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import { CompanionFlowEdgeGestures } from './CompanionFlowEdgeGestures';

type Controls = { refreshPending: boolean; busy: boolean; canUndo: boolean; canRedo: boolean; apply(mode: HistoryMode): void };
const FlowHistoryContext = createContext<Controls | null>(null);

export function CompanionFlowHistorySurface(props: {
  children: ReactNode; active: boolean; busy: boolean; historyKey: string; refreshPending?: boolean; onApply(mode: HistoryMode): void;
}) {
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    let active = true;
    async function update() {
      if (!props.active || !isAvailableNativeCompanionRuntime()) return;
      try {
        const history = await loadCompanionFlowHistory(props.historyKey);
        if (active) setAvailability({ canUndo: history.undoStack.length > 0, canRedo: history.redoStack.length > 0 });
      } catch { if (active) setAvailability({ canUndo: false, canRedo: false }); }
    }
    void update();
    const unsubscribe = subscribeCompanionSyncMutationRevision(() => void update());
    return () => { active = false; unsubscribe(); };
  }, [props.active, props.historyKey]);
  const controls = props.active ? { ...availability, busy: props.busy, refreshPending: props.refreshPending === true, apply: props.onApply } : null;
  return <FlowHistoryContext.Provider value={controls}>
    {props.children}
    <CompanionFlowEdgeGestures enabled={props.active && !props.busy && !props.refreshPending}
      {...availability} onApply={props.onApply} />
  </FlowHistoryContext.Provider>;
}

export function CompanionFlowOrEditHistoryActions(props: { open: boolean; editHistory?: CompanionEditHistoryActionsProps }) {
  const controls = useContext(FlowHistoryContext);
  const t = useTranslation();
  if (!controls) return props.editHistory ? <CompanionEditHistoryActions {...props.editHistory} open={props.open} /> : null;
  if (controls.refreshPending) return <button type="button" disabled={controls.busy}
    className="min-h-11 w-full border-b border-companion-divider py-2 text-sm text-foreground"
    onClick={() => controls.apply('undo')}>{t('companion.selection.refresh')}</button>;
  return <div className="flex gap-3 border-b border-companion-divider py-2">
    {(['undo', 'redo'] as const).map(mode => {
      const Icon = mode === 'undo' ? Undo2 : Redo2;
      return <button key={mode} type="button" disabled={controls.busy || !(mode === 'undo' ? controls.canUndo : controls.canRedo)}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm text-foreground disabled:opacity-40"
        onClick={() => controls.apply(mode)}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t(mode === 'undo' ? 'companion.reading.undoFlow' : 'companion.reading.redoFlow')}</button>;
    })}
  </div>;
}

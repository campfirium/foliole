import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createEmptyEditorOperationHistory, getEditorOperationTopEntry,
  getEditorOperationRedoTitle, getEditorOperationUndoTitle } from '../features/editor/model/editorOperationHistory';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export interface CompanionEditHistoryActionsProps {
  documentId: string;
  flush?: () => Promise<void>;
  refresh: () => Promise<unknown>;
  adopt?: (nodeId: string, versionId: string) => Promise<void>;
}

export function CompanionEditHistoryActions(props: CompanionEditHistoryActionsProps & { open: boolean }) {
  const t = useTranslation();
  const [history, setHistory] = useState(createEmptyEditorOperationHistory);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const locked = useRef(false);
  const refreshPending = useRef(false);
  const applied = useRef<{ nodeId: string; versionId: string } | false>(false);
  const scope = getCompanionReadingScope();
  useEffect(() => {
    if (!props.open || !isAvailableNativeCompanionRuntime()) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      await props.flush?.();
      const next = await loadCompanionEditHistory();
      if (!cancelled && scope === getCompanionReadingScope()) setHistory(next);
    })().catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [props.open, props.documentId, scope]);

  async function apply(mode: 'undo' | 'redo') {
    if (locked.current || scope !== getCompanionReadingScope()) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      await props.flush?.();
      if (scope !== getCompanionReadingScope()) return;
      if (!refreshPending.current) applied.current = await applyCompanionEditHistory(props.documentId, mode);
      refreshPending.current = true;
      await props.refresh();
      if (applied.current) await props.adopt?.(applied.current.nodeId, applied.current.versionId);
      refreshPending.current = false;
      setHistory(await loadCompanionEditHistory());
    } catch { setError(true); }
    finally { locked.current = false; setBusy(false); }
  }
  return <div className="border-b border-companion-divider">
    <div className="flex gap-3 py-2">
      {(['undo', 'redo'] as const).map(mode => {
        const Icon = mode === 'undo' ? Undo2 : Redo2;
        const label = refreshPending.current ? t('companion.selection.refresh') : mode === 'undo'
          ? getEditorOperationUndoTitle(history, props.documentId, t) : getEditorOperationRedoTitle(history, props.documentId, t);
        return <button key={mode} type="button" aria-label={label}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm text-foreground disabled:opacity-40"
          disabled={busy || (!refreshPending.current && !getEditorOperationTopEntry(history, props.documentId, mode))}
          onClick={() => void apply(mode)}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><span>{label}</span></button>;
      })}
    </div>
    {error ? <p role="alert" className="pb-3 text-sm text-error">{t('companion.reading.historyError')}</p> : null}
  </div>;
}

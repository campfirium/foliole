import type { WorkspaceActionHistoryState } from './workspaceActionHistory';

export type HistoryCommandMode = 'redo' | 'undo';

export function resolveWorkspaceHistoryCommand(
  history: WorkspaceActionHistoryState,
  mode: HistoryCommandMode,
  expectedEntryId?: string
) {
  if (history.applying) return null;
  const pending = history.pendingAction ?? history.pendingCreate;
  if (pending) {
    if (mode !== 'undo' || (expectedEntryId && pending.entry.id !== expectedEntryId)) return null;
    return { entry: pending.entry, phase: 'pending' as const };
  }
  const entry = (mode === 'undo' ? history.undoStack : history.redoStack).at(-1);
  if (!entry || (expectedEntryId && entry.id !== expectedEntryId)) return null;
  return { entry, phase: 'committed' as const };
}

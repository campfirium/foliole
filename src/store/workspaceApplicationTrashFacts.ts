import type { ApplicationHistory, ApplicationOperation, HistoryDirection } from './workspaceApplicationHistory';

export function rebaseApplicationTrashFacts(history: ApplicationHistory, moved: ApplicationOperation, direction: HistoryDirection) {
  const annotation = moved.domain === 'editor' && moved.entry.type !== 'text.edit' &&
    ((moved.entry.type === 'annotation.create') === (direction === 'undo')) ? moved.entry : null;
  const deletion = moved.domain === 'workspace'
    ? moved.entry.type === 'workspace.restore' && direction === 'undo' ? moved.entry.deletion
      : moved.entry.type === 'workspace.delete' && direction === 'redo' ? moved.entry : null : null;
  if (!annotation && !deletion) return history;
  const update = (stack: ApplicationOperation[]) => stack.map(operation => {
    if (operation.id === moved.id) return operation;
    if (annotation && operation.domain === 'editor' && operation.entry.type !== 'text.edit' &&
      operation.entry.annotations.map(value => value.nodeId).sort().join('|') === annotation.annotations.map(value => value.nodeId).sort().join('|')) {
      return { ...operation, entry: { ...operation.entry, historyDeletedAt: annotation.historyDeletedAt } } as ApplicationOperation;
    }
    if (deletion && operation.domain === 'workspace') {
      const target = operation.entry.type === 'workspace.delete' ? operation.entry : operation.entry.type === 'workspace.restore' ? operation.entry.deletion : null;
      if (target && target.nodeIds.slice().sort().join('|') === deletion.nodeIds.slice().sort().join('|')) {
        const updated = { ...target, afterDeletedAtById: deletion.afterDeletedAtById };
        return { ...operation, entry: operation.entry.type === 'workspace.restore' ? { ...operation.entry, deletion: updated } : updated } as ApplicationOperation;
      }
    }
    return operation;
  });
  return { ...history, undo: update(history.undo), redo: update(history.redo) };
}

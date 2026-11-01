import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextEditOperationEntry } from '../../features/editor/model/editorOperationHistory';
import { createEditorTextReplaySave } from '../../features/editor/model/editorTextReplaySave';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function applyEditorTextReplay(adapter: EditorAdapter | null, entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo') {
  if (!adapter?.applyTextHistory) return false;
  const scope = useWorkspaceStore.getState().libraryScope;
  const save = createEditorTextReplaySave(retry => {
    if (useWorkspaceStore.getState().libraryScope !== scope) return;
    showAppRuntimeNotice('Changes could not be saved.', 'error', { label: 'Retry', onSelect: retry }, { durationMs: 30_000 });
  });
  const applied = adapter.applyTextHistory(entry, mode, save);
  if (!applied || save.status === 'unbound') {
    save.reject();
    return false;
  }
  return typeof applied === 'object' ? { ...applied, persistence: save.completion, save } : false;
}

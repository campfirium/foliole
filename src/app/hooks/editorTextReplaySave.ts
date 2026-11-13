import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextEditOperationEntry } from '../../features/editor/model/editorOperationHistory';
import { createEditorTextReplaySave } from '../../features/editor/model/editorTextReplaySave';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function applyEditorTextReplay(adapter: EditorAdapter | null, entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo') {
  if (!adapter?.applyTextHistory) return false;
  const scope = useWorkspaceStore.getState().libraryScope;
  const save = createEditorTextReplaySave(retry => {
    const locale = getStoredAppLocale();
    if (useWorkspaceStore.getState().libraryScope !== scope) return;
    showAppRuntimeNotice(translate(locale, 'desktop.feedback.saveFailed'), 'error', { label: translate(locale, 'desktop.feedback.retry'), onSelect: retry }, { durationMs: 30_000 });
  });
  const applied = adapter.applyTextHistory(entry, mode, save);
  if (!applied || save.status === 'unbound') {
    save.reject();
    return false;
  }
  return typeof applied === 'object' ? { ...applied, persistence: save.completion, save } : false;
}

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

interface FolioleDebugApi {
  clearEditor: (id: string) => void;
  getEditorContent: (id: string) => string | null;
  getEditorSelection: (id: string) => { from: number; to: number } | null;
  registerEditor: (id: string, adapter: EditorAdapter) => void;
  setEditorSelection: (id: string, from: number, to: number) => boolean;
}

type FolioleWindow = Window & {
  __folioleDebug?: FolioleDebugApi;
};

const editorMap = new Map<string, EditorAdapter>();

function ensureDebugApi() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return null;
  }

  const targetWindow = window as FolioleWindow;
  if (targetWindow.__folioleDebug) {
    return targetWindow.__folioleDebug;
  }

  const api: FolioleDebugApi = {
    clearEditor: (id) => {
      editorMap.delete(id);
    },
    getEditorContent: (id) => {
      const adapter = editorMap.get(id);
      return adapter ? adapter.getContent() : null;
    },
    getEditorSelection: (id) => {
      const adapter = editorMap.get(id);
      return adapter ? adapter.getSelection() : null;
    },
    registerEditor: (id, adapter) => {
      editorMap.set(id, adapter);
    },
    setEditorSelection: (id, from, to) => {
      const adapter = editorMap.get(id);
      if (!adapter) {
        return false;
      }
      adapter.setSelection({ from, to });
      adapter.focus();
      return true;
    }
  };

  targetWindow.__folioleDebug = api;
  return api;
}

export function registerDebugEditorAdapter(id: string, adapter: EditorAdapter) {
  const api = ensureDebugApi();
  api?.registerEditor(id, adapter);
}

export function clearDebugEditorAdapter(id: string) {
  const api = ensureDebugApi();
  api?.clearEditor(id);
}

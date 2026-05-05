import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { appendReadingPositionTraceLog } from '../platform/bridge';
import { getElectronAPI } from '../platform/electronApi';

interface FolioleDebugApi {
  clearEditor: (id: string) => void;
  clearTraces: () => void;
  getEditorContent: (id: string) => string | null;
  getEditorPositionViewportTop: (id: string, position: number) => number | null;
  getEditorScrollTop: (id: string) => number | null;
  getEditorSelection: (id: string) => { from: number; to: number } | null;
  getEditorViewportRect: (id: string) => { height: number; top: number } | null;
  getTraces: () => DebugTraceEntry[];
  pushTrace: (event: string, payload: unknown) => void;
  registerEditor: (id: string, adapter: EditorAdapter) => void;
  setEditorSelection: (id: string, from: number, to: number) => boolean;
}

export interface DebugTraceEntry {
  event: string;
  payload: unknown;
  timestamp: number;
}

type FolioleWindow = Window & {
  __folioleDebug?: FolioleDebugApi;
};

const editorMap = new Map<string, EditorAdapter>();
const debugTraceLog: DebugTraceEntry[] = [];
const MAX_DEBUG_TRACE_COUNT = 400;
const FILE_TRACE_KEYWORDS = [
  'reading',
  'scroll-sync',
  'restore-selection',
  'immersive.toggle',
  'immersive.entry-selection',
  'immersive.viewport-reading.sampled',
  'editor.viewport'
] as const;
let lastPersistedTraceSignature: string | null = null;
let debugApiAvailability: 'unknown' | 'enabled' | 'disabled' = 'unknown';

function shouldPersistTraceToFile(event: string) {
  return FILE_TRACE_KEYWORDS.some((keyword) => event.includes(keyword));
}

function buildTraceSignature(entry: DebugTraceEntry) {
  return JSON.stringify({
    event: entry.event,
    payload: entry.payload
  });
}

function createDebugApi(): FolioleDebugApi {
  return {
    clearEditor: (id) => {
      editorMap.delete(id);
    },
    clearTraces: () => {
      debugTraceLog.length = 0;
    },
    getEditorContent: (id) => {
      const adapter = editorMap.get(id);
      return adapter ? adapter.getContent() : null;
    },
    getEditorPositionViewportTop: (id, position) => {
      const adapter = editorMap.get(id);
      return adapter?.getPositionViewportTop ? adapter.getPositionViewportTop(position) : null;
    },
    getEditorScrollTop: (id) => {
      const adapter = editorMap.get(id);
      return adapter ? adapter.getScrollTop() : null;
    },
    getEditorSelection: (id) => {
      const adapter = editorMap.get(id);
      return adapter ? adapter.getSelection() : null;
    },
    getEditorViewportRect: (id) => {
      const adapter = editorMap.get(id);
      const rect = adapter?.getViewportRect?.();
      return rect ? { height: rect.height, top: rect.top } : null;
    },
    getTraces: () => [...debugTraceLog],
    pushTrace: (event, payload) => {
      debugTraceLog.push({
        event,
        payload,
        timestamp: Date.now()
      });
      if (debugTraceLog.length > MAX_DEBUG_TRACE_COUNT) {
        debugTraceLog.splice(0, debugTraceLog.length - MAX_DEBUG_TRACE_COUNT);
      }
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
}

function ensureDebugApi() {
  if (!isDebugApiAvailable()) {
    return null;
  }

  const targetWindow = window as FolioleWindow;
  if (targetWindow.__folioleDebug) {
    return targetWindow.__folioleDebug;
  }
  targetWindow.__folioleDebug = createDebugApi();
  return targetWindow.__folioleDebug;
}

function isDebugApiAvailable() {
  if (typeof window === 'undefined') {
    debugApiAvailability = 'disabled';
    return false;
  }
  if (debugApiAvailability !== 'unknown') {
    return debugApiAvailability === 'enabled';
  }
  const enabled = import.meta.env.DEV || import.meta.env.MODE === 'test' || Boolean(getElectronAPI()?.debug);
  debugApiAvailability = enabled ? 'enabled' : 'disabled';
  return enabled;
}

export function registerDebugEditorAdapter(id: string, adapter: EditorAdapter) {
  const api = ensureDebugApi();
  api?.registerEditor(id, adapter);
}

export function clearDebugEditorAdapter(id: string) {
  const api = ensureDebugApi();
  api?.clearEditor(id);
}

export function pushDebugTrace(event: string, payload: unknown) {
  const api = ensureDebugApi();
  const entry = {
    event,
    payload,
    timestamp: Date.now()
  };
  api?.pushTrace(event, payload);
  if (!shouldPersistTraceToFile(event)) {
    return;
  }
  const signature = buildTraceSignature(entry);
  if (signature === lastPersistedTraceSignature) {
    return;
  }
  lastPersistedTraceSignature = signature;
  appendReadingPositionTraceLog(entry);
}

export function readDebugTraces() {
  if (typeof window === 'undefined') {
    return [];
  }
  const targetWindow = window as FolioleWindow;
  return targetWindow.__folioleDebug?.getTraces?.() ?? [];
}

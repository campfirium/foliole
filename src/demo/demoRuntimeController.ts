import type {
  DemoMarkdownRuntimeEntry,
  DemoMarkdownRuntimeImportResult,
  DemoRuntimeController,
  DemoRuntimeState
} from '../shared/platform/runtime/demoRuntime';
import { useWorkspaceStore } from '../store/workspaceStore';

import {
  clearDemoLocalStorage,
  readDemoManualAdvanceDays,
  readOrCreateDemoStartedAt,
  writeDemoManualAdvanceDays
} from './demoLocalStorage';
import { applyDemoMarkdownImport } from './demoMarkdownImport';
import { resetDemoWorkspaceSnapshot } from './demoWorkspaceReset';

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveDemoDayIndex(startedAt: string, manualAdvanceDays: number, realNow = new Date()) {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return manualAdvanceDays;
  }
  const elapsedDays = Math.max(0, Math.floor((realNow.getTime() - startedAtMs) / DAY_MS));
  return elapsedDays + manualAdvanceDays;
}

function createDemoRuntimeState(partial: Partial<DemoRuntimeState> = {}, realNow = new Date()): DemoRuntimeState {
  const startedAt = readOrCreateDemoStartedAt(realNow);
  const manualAdvanceDays = readDemoManualAdvanceDays();
  return {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo: true,
    manualAdvanceDays,
    previewDay: resolveDemoDayIndex(startedAt, manualAdvanceDays, realNow),
    startedAt,
    ...partial
  };
}

export function createBrowserDemoRuntimeController(): DemoRuntimeController {
  const listeners = new Set<() => void>();
  let state: DemoRuntimeState = createDemoRuntimeState();

  const notify = () => listeners.forEach((listener) => listener());
  const getNowIso = (realNow: Date) => new Date(realNow.getTime() + state.manualAdvanceDays * DAY_MS).toISOString();
  const setState = (nextState: DemoRuntimeState) => {
    state = nextState;
    notify();
  };
  const updateState = (partial: Partial<DemoRuntimeState>) => setState({ ...state, ...partial });

  return {
    async clearLocalData() {
      return clearBrowserDemoLocalData(updateState);
    },
    continueToNextPreviewDay() {
      const manualAdvanceDays = state.manualAdvanceDays + 1;
      writeDemoManualAdvanceDays(manualAdvanceDays);
      const startedAt = state.startedAt ?? readOrCreateDemoStartedAt();
      setState({
        ...state,
        clearError: null,
        manualAdvanceDays,
        previewDay: resolveDemoDayIndex(startedAt, manualAdvanceDays),
        startedAt
      });
    },
    getNowIso(realNow) {
      return getNowIso(realNow);
    },
    getState() {
      return state;
    },
    async importMarkdown(entries) {
      return importMarkdownIntoBrowserDemo(entries, getNowIso(new Date()), updateState);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

async function clearBrowserDemoLocalData(updateState: (partial: Partial<DemoRuntimeState>) => void) {
  try {
    clearDemoLocalStorage();
    resetDemoWorkspaceSnapshot();
    updateState({
      ...createDemoRuntimeState()
    });
    return true;
  } catch (error) {
    updateState({ clearError: error instanceof Error ? error.message : 'Demo local data could not be cleared.' });
    return false;
  }
}

async function importMarkdownIntoBrowserDemo(
  entries: DemoMarkdownRuntimeEntry[],
  nowIso: string,
  updateState: (partial: Partial<DemoRuntimeState>) => void
): Promise<DemoMarkdownRuntimeImportResult> {
  try {
    const result = applyDemoMarkdownImport(useWorkspaceStore.getState(), entries, nowIso);
    if (result.importedTopicIds.length > 0) {
      useWorkspaceStore.setState(result.state);
    }
    updateState({ importError: null, importedTopicCount: result.importedTopicIds.length });
    return { ignoredCount: result.ignoredCount, importedTopicCount: result.importedTopicIds.length };
  } catch (error) {
    updateState({
      importError: error instanceof Error ? error.message : 'Markdown could not be imported.',
      importedTopicCount: 0
    });
    return { ignoredCount: entries.length, importedTopicCount: 0 };
  }
}

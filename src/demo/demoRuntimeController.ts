import type { DemoRuntimeController, DemoRuntimeState } from '../shared/platform/runtime/demoRuntime';

import {
  clearDemoLocalStorage,
  readDemoPreviewDay,
  writeDemoPreviewDay
} from './demoLocalStorage';
import { installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createBrowserDemoRuntimeController(): DemoRuntimeController {
  const listeners = new Set<() => void>();
  let state: DemoRuntimeState = {
    clearError: null,
    isDemo: true,
    previewDay: readDemoPreviewDay()
  };

  const notify = () => listeners.forEach((listener) => listener());
  const setState = (nextState: DemoRuntimeState) => {
    state = nextState;
    notify();
  };

  return {
    async clearLocalData() {
      try {
        clearDemoLocalStorage();
        await installDemoWorkspaceSnapshot();
        setState({ clearError: null, isDemo: true, previewDay: readDemoPreviewDay() });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Demo local data could not be cleared.';
        setState({ ...state, clearError: message });
        return false;
      }
    },
    continueToNextPreviewDay() {
      const previewDay = state.previewDay + 1;
      writeDemoPreviewDay(previewDay);
      setState({ ...state, clearError: null, previewDay });
    },
    getNowIso(realNow) {
      return new Date(realNow.getTime() + state.previewDay * DAY_MS).toISOString();
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

import { useSyncExternalStore } from 'react';

export interface DemoRuntimeState {
  clearError: string | null;
  isDemo: boolean;
  previewDay: number;
}

export interface DemoRuntimeController {
  clearLocalData: () => Promise<boolean>;
  continueToNextPreviewDay: () => void;
  getNowIso: (realNow: Date) => string;
  getState: () => DemoRuntimeState;
  subscribe: (listener: () => void) => () => void;
}

const defaultState: DemoRuntimeState = {
  clearError: null,
  isDemo: false,
  previewDay: 0
};

const defaultController: DemoRuntimeController = {
  clearLocalData: () => Promise.resolve(false),
  continueToNextPreviewDay: () => undefined,
  getNowIso: (realNow) => realNow.toISOString(),
  getState: () => defaultState,
  subscribe: () => () => undefined
};

let activeController = defaultController;

export function installDemoRuntimeController(controller: DemoRuntimeController) {
  activeController = controller;
}

export function getDemoRuntimeState() {
  return activeController.getState();
}

export function subscribeDemoRuntimeState(listener: () => void) {
  return activeController.subscribe(listener);
}

export function clearDemoLocalData() {
  return activeController.clearLocalData();
}

export function continueToNextDemoPreviewDay() {
  activeController.continueToNextPreviewDay();
}

export function getDemoRuntimeNowIso(realNow = new Date()) {
  return activeController.getNowIso(realNow);
}

export function useDemoRuntimeState() {
  return useSyncExternalStore(activeController.subscribe, activeController.getState, () => defaultState);
}

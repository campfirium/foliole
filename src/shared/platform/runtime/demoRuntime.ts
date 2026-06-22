import { useSyncExternalStore } from 'react';

export interface DemoRuntimeState {
  clearError: string | null;
  manualAdvanceDays: number;
  importError: string | null;
  importedTopicCount: number;
  isDemo: boolean;
  previewDay: number;
  startedAt: string | null;
}

export interface DemoMarkdownRuntimeEntry {
  markdown: string;
  relativePath?: string;
  sourceName?: string;
}

export interface DemoMarkdownRuntimeImportResult {
  ignoredCount: number;
  importedTopicCount: number;
}

export interface DemoRuntimeController {
  clearLocalData: () => Promise<boolean>;
  continueToNextPreviewDay: () => void;
  getNowIso: (realNow: Date) => string;
  getState: () => DemoRuntimeState;
  importMarkdown: (entries: DemoMarkdownRuntimeEntry[]) => Promise<DemoMarkdownRuntimeImportResult>;
  subscribe: (listener: () => void) => () => void;
}

const defaultState: DemoRuntimeState = {
  clearError: null,
  manualAdvanceDays: 0,
  importError: null,
  importedTopicCount: 0,
  isDemo: false,
  previewDay: 0,
  startedAt: null
};

const defaultController: DemoRuntimeController = {
  clearLocalData: () => Promise.resolve(false),
  continueToNextPreviewDay: () => undefined,
  getNowIso: (realNow) => realNow.toISOString(),
  getState: () => defaultState,
  importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
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

export async function resetDemoExperience() {
  return clearDemoLocalData();
}

export function continueToNextDemoPreviewDay() {
  activeController.continueToNextPreviewDay();
}

export function getDemoRuntimeNowIso(realNow = new Date()) {
  return activeController.getNowIso(realNow);
}

export function importDemoMarkdown(entries: DemoMarkdownRuntimeEntry[]) {
  return activeController.importMarkdown(entries);
}

export function useDemoRuntimeState() {
  return useSyncExternalStore(activeController.subscribe, activeController.getState, () => defaultState);
}

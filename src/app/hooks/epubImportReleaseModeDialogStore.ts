import { useSyncExternalStore } from 'react';

import type { RuntimeImportedTextFile } from '../../shared/platform/importExecutionRuntimeRepository';

import {
  detectEpubPreviewHighlights,
  resolveDefaultEpubReleaseMode,
  type EpubImportReleaseMode
} from './epubImportReleaseMode';

export interface EpubImportReleaseModeDialogSnapshot {
  file: RuntimeImportedTextFile;
  hasHighlights: boolean;
  recommendedMode: EpubImportReleaseMode;
  selectedMode: EpubImportReleaseMode;
}

interface PendingSelection extends EpubImportReleaseModeDialogSnapshot {
  resolve: (mode: EpubImportReleaseMode | null) => void;
}

let currentSelection: PendingSelection | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function getSnapshot(): EpubImportReleaseModeDialogSnapshot | null {
  return currentSelection
    ? {
        file: currentSelection.file,
        hasHighlights: currentSelection.hasHighlights,
        recommendedMode: currentSelection.recommendedMode,
        selectedMode: currentSelection.selectedMode
      }
    : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEpubImportReleaseModeDialogSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function requestEpubImportReleaseMode(file: RuntimeImportedTextFile) {
  if (currentSelection) {
    currentSelection.resolve(null);
  }
  const recommendedMode = resolveDefaultEpubReleaseMode(file.content);
  return new Promise<EpubImportReleaseMode | null>((resolve) => {
    currentSelection = {
      file,
      hasHighlights: detectEpubPreviewHighlights(file.content),
      recommendedMode,
      resolve,
      selectedMode: recommendedMode
    };
    emitChange();
  });
}

export function selectEpubImportReleaseMode(mode: EpubImportReleaseMode) {
  if (!currentSelection) return;
  currentSelection = { ...currentSelection, selectedMode: mode };
  emitChange();
}

export function closeEpubImportReleaseModeDialog(mode: EpubImportReleaseMode | null) {
  const selection = currentSelection;
  if (!selection) return;
  currentSelection = null;
  selection.resolve(mode);
  emitChange();
}

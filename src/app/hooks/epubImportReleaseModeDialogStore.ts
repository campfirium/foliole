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
let currentSnapshot: EpubImportReleaseModeDialogSnapshot | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function getSnapshot(): EpubImportReleaseModeDialogSnapshot | null {
  return currentSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEpubImportReleaseModeDialogSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function requestEpubImportReleaseMode(file: RuntimeImportedTextFile) {
  return requestEpubImportReleaseModeSnapshot({
    file,
    hasHighlights: detectEpubPreviewHighlights(file.content),
    recommendedMode: resolveDefaultEpubReleaseMode(file.content)
  });
}

export function requestReadwiseBookEpubImportReleaseMode(input: {
  fileName: string;
  hasHighlights: boolean;
}) {
  return requestEpubImportReleaseModeSnapshot({
    file: {
      content: '',
      fileName: input.fileName,
      filePath: '',
      kind: 'epub'
    },
    hasHighlights: input.hasHighlights,
    recommendedMode: input.hasHighlights ? 'free' : 'sequential'
  });
}

function requestEpubImportReleaseModeSnapshot(input: {
  file: RuntimeImportedTextFile;
  hasHighlights: boolean;
  recommendedMode: EpubImportReleaseMode;
}) {
  if (currentSelection) {
    currentSelection.resolve(null);
  }
  return new Promise<EpubImportReleaseMode | null>((resolve) => {
    currentSelection = {
      file: input.file,
      hasHighlights: input.hasHighlights,
      recommendedMode: input.recommendedMode,
      resolve,
      selectedMode: input.recommendedMode
    };
    currentSnapshot = toSnapshot(currentSelection);
    emitChange();
  });
}

function toSnapshot(selection: PendingSelection): EpubImportReleaseModeDialogSnapshot {
  return {
    file: selection.file,
    hasHighlights: selection.hasHighlights,
    recommendedMode: selection.recommendedMode,
    selectedMode: selection.selectedMode
  };
}

export function selectEpubImportReleaseMode(mode: EpubImportReleaseMode) {
  if (!currentSelection) return;
  currentSelection = { ...currentSelection, selectedMode: mode };
  currentSnapshot = toSnapshot(currentSelection);
  emitChange();
}

export function closeEpubImportReleaseModeDialog(mode: EpubImportReleaseMode | null) {
  const selection = currentSelection;
  if (!selection) return;
  currentSelection = null;
  currentSnapshot = null;
  selection.resolve(mode);
  emitChange();
}

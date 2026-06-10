import { useState } from 'react';

import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

export type ExternalLibraryViewTarget =
  | { kind: 'notes' }
  | { kind: 'external'; selection: ExternalLibrarySelection };

export interface ExternalLibraryViewHistory {
  backStack: ExternalLibraryViewTarget[];
  forwardStack: ExternalLibraryViewTarget[];
}

const INITIAL_EXTERNAL_LIBRARY_VIEW_HISTORY: ExternalLibraryViewHistory = {
  backStack: [],
  forwardStack: []
};

function createExternalLibraryViewTarget(
  isExternalViewOpen: boolean,
  selection: ExternalLibrarySelection
): ExternalLibraryViewTarget {
  return isExternalViewOpen ? { kind: 'external', selection } : { kind: 'notes' };
}

function areExternalLibrarySelectionsEqual(left: ExternalLibrarySelection, right: ExternalLibrarySelection) {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'root' || right.kind === 'root') {
    return true;
  }
  if (left.folderId !== right.folderId) {
    return false;
  }
  if (left.kind === 'directory' && right.kind === 'directory') {
    return left.directoryPath === right.directoryPath;
  }
  if (left.kind === 'document' && right.kind === 'document') {
    return left.absolutePath === right.absolutePath;
  }
  return left.kind === 'folder' && right.kind === 'folder';
}

function areExternalLibraryViewTargetsEqual(left: ExternalLibraryViewTarget, right: ExternalLibraryViewTarget) {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'notes' || right.kind === 'notes') {
    return true;
  }
  return areExternalLibrarySelectionsEqual(left.selection, right.selection);
}

function pushExternalLibraryViewHistory(
  history: ExternalLibraryViewHistory,
  currentTarget: ExternalLibraryViewTarget,
  nextTarget: ExternalLibraryViewTarget
): ExternalLibraryViewHistory {
  if (areExternalLibraryViewTargetsEqual(currentTarget, nextTarget)) {
    return history;
  }
  return {
    backStack: [...history.backStack, currentTarget],
    forwardStack: []
  };
}

export function useExternalLibraryViewHistory(args: {
  applyTarget: (target: ExternalLibraryViewTarget) => void;
  isExternalViewOpen: boolean;
  selection: ExternalLibrarySelection;
}) {
  const [history, setHistory] = useState(INITIAL_EXTERNAL_LIBRARY_VIEW_HISTORY);
  const currentTarget = createExternalLibraryViewTarget(args.isExternalViewOpen, args.selection);

  return {
    canGoBack: history.backStack.length > 0,
    canGoForward: history.forwardStack.length > 0,
    goBack: () => {
      const target = history.backStack[history.backStack.length - 1];
      if (!target) return false;
      setHistory({
        backStack: history.backStack.slice(0, -1),
        forwardStack: [currentTarget, ...history.forwardStack]
      });
      args.applyTarget(target);
      return true;
    },
    goForward: () => {
      const target = history.forwardStack[0];
      if (!target) return false;
      setHistory({
        backStack: [...history.backStack, currentTarget],
        forwardStack: history.forwardStack.slice(1)
      });
      args.applyTarget(target);
      return true;
    },
    openExternalTarget: (nextSelection: ExternalLibrarySelection) => {
      const nextTarget: ExternalLibraryViewTarget = { kind: 'external', selection: nextSelection };
      setHistory((current) => pushExternalLibraryViewHistory(current, currentTarget, nextTarget));
      args.applyTarget(nextTarget);
    }
  };
}

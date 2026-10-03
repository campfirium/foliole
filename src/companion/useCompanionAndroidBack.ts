import { useEffect, useRef } from 'react';

import { exitAndroidApp, subscribeAndroidBack } from '../shared/platform/androidBack';

import { COMPANION_ANDROID_CAPTURE_BACK_EVENT, dispatchCompanionAndroidBack } from './companionAndroidBackEvent';
import type { CompanionShellModel } from './CompanionShell';

function closeTopDialog(): boolean {
  if (!document.querySelector('[role="dialog"][data-state="open"]')) return false;
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  return true;
}

function hasBack(value: unknown): value is { onBack(): void } {
  return Boolean(value && typeof value === 'object' && 'onBack' in value && typeof value.onBack === 'function');
}

export function handleCompanionAndroidBack(model: CompanionShellModel): void {
  if (model.isCaptureSheetOpen) {
    dispatchCompanionAndroidBack(COMPANION_ANDROID_CAPTURE_BACK_EVENT);
    return;
  }
  if (closeTopDialog()) return;
  if (dispatchCompanionAndroidBack()) return;
  if (model.searchExternalDocument) return model.handleExitSearchExternalDocument();
  if (model.searchPdfResult) return model.handleExitSearchPdf();
  if (model.isSearchArticleOpen) return model.handleExitSearchArticle();
  if (model.isBrowseDirectoryOpen) {
    if (model.directorySelection.kind !== 'root' && hasBack(model.topBarProps)) return model.topBarProps.onBack();
    model.handleNavigationAction('recent');
    return;
  }
  if (model.surface.activeAction === 'more' && model.settingsPage !== 'list' && hasBack(model.topBarProps)) {
    return model.topBarProps.onBack();
  }
  if (model.surface.activeAction === 'review') {
    if (model.isOnlyReviewOpen) return model.handleNavigationAction('review');
    return model.handleNavigationAction('recent');
  }
  if (model.surface.activeAction === 'recent' && model.surface.selectedBrowseNodeId) {
    return model.surface.handleExitBrowseArticle();
  }
  exitAndroidApp();
}

export function useCompanionAndroidBack(model: CompanionShellModel): void {
  const current = useRef(model);
  current.current = model;
  useEffect(() => subscribeAndroidBack(() => handleCompanionAndroidBack(current.current)), []);
}

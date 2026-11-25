import { Capacitor, registerPlugin } from '@capacitor/core';
import { useLayoutEffect, useSyncExternalStore } from 'react';

import {
  applySelectionToolbarOpacityPercent, getSelectionToolbarEnabled, getSelectionToolbarOpacityPercent,
  setSelectionToolbarEnabled, setSelectionToolbarOpacityPercent
} from '../features/editor/model/selectionToolbarSettings';
import { getImageFocusTransparencyPercent, setImageFocusTransparencyPercent } from '../features/settings/model/appearanceReadingModeSettings';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

export interface CompanionToolbarAppearance {
  selectionToolbarEnabled: boolean;
  selectionToolbarOpacityPercent: number;
  imageFocusTransparencyPercent: number;
}

interface NativeSelectionMenuHost {
  setNativeSelectionMenu(options: { enabled: boolean }): Promise<void>;
}
const nativeSelectionMenu = registerPlugin<NativeSelectionMenuHost>('FolioleCompanionBootstrap');

function read(): CompanionToolbarAppearance {
  return {
    selectionToolbarEnabled: getSelectionToolbarEnabled(),
    selectionToolbarOpacityPercent: getSelectionToolbarOpacityPercent(),
    imageFocusTransparencyPercent: getImageFocusTransparencyPercent()
  };
}

let current = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return current;
}

/** Android clears WebView's own selection menu while the app toolbar owns reading selections. */
function syncNativeSelectionMenu(toolbarEnabled: boolean) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  void nativeSelectionMenu.setNativeSelectionMenu({ enabled: !toolbarEnabled }).catch((error: unknown) => logRuntimeError(
    'Native selection menu update failed', { area: 'native', action: 'selection-menu-update', error }));
}

function applyAppearance(value: CompanionToolbarAppearance) {
  applySelectionToolbarOpacityPercent(value.selectionToolbarOpacityPercent);
  document.documentElement.style.setProperty('--app-image-focus-opacity', String((100 - value.imageFocusTransparencyPercent) / 100));
}

/** Returns false when local storage rejected the write. */
export function updateCompanionToolbarAppearance(patch: Partial<CompanionToolbarAppearance>) {
  try {
    if (patch.selectionToolbarEnabled !== undefined) setSelectionToolbarEnabled(patch.selectionToolbarEnabled);
    if (patch.selectionToolbarOpacityPercent !== undefined) setSelectionToolbarOpacityPercent(patch.selectionToolbarOpacityPercent);
    if (patch.imageFocusTransparencyPercent !== undefined) setImageFocusTransparencyPercent(patch.imageFocusTransparencyPercent);
  } catch {
    return false;
  }
  current = read();
  for (const listener of listeners) listener();
  return true;
}

export function useCompanionToolbarAppearance() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Mounted once at the companion root so reading surfaces and native selection start from the saved values. */
export function useApplyCompanionToolbarAppearance() {
  const value = useCompanionToolbarAppearance();
  useLayoutEffect(() => { applyAppearance(value); }, [value]);
  useLayoutEffect(() => { syncNativeSelectionMenu(value.selectionToolbarEnabled); }, [value.selectionToolbarEnabled]);
}

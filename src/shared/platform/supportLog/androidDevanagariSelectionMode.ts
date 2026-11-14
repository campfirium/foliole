import { getCompanionRuntimeCapability } from '../companionRuntimeCapabilities';

const storageKey = 'foliole-android-devanagari-selection-mode';
export type DevanagariSelectionMode = 'off' | 'annotation';

export function getDevanagariSelectionMode(): DevanagariSelectionMode | undefined {
  if (getCompanionRuntimeCapability().kind !== 'android-native') return undefined;
  return localStorage.getItem(storageKey) === 'off' ? 'off' : 'annotation';
}

export function setDevanagariSelectionMode(mode: DevanagariSelectionMode) {
  localStorage.setItem(storageKey, mode);
}

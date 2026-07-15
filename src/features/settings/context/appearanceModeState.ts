import { getBaseColorMode } from '../model/appearanceSettings';
import { resolveBaseColorMode } from '../model/baseColorMode';

export function getInitialAppearanceModeState() {
  const baseColorMode = getBaseColorMode();
  return { baseColorMode, resolvedBaseColorMode: resolveBaseColorMode(baseColorMode) };
}

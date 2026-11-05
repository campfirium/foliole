import { useDetectedReadingFontWeights } from '../../../shared/typography/useDetectedReadingFontWeights';
import type { InterfaceFontPreset } from '../model/appearanceSettings';
import { resolveInterfaceFontFamily } from '../model/appearanceTypography';

export function useReadingFontWeights(preset: InterfaceFontPreset, custom: string, retry: number) {
  const family = resolveInterfaceFontFamily(preset, custom);
  return useDetectedReadingFontWeights(family, retry);
}

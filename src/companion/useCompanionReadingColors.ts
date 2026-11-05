import { useLayoutEffect, useState } from 'react';

import {
  applyAppearanceColorSettings, getAccentColorPreset, getClozeColorPreset, getFontColorPreset,
  getHighlightColorPreset, getSelectionColorPreset, setAccentColorPreset, setClozeColorPreset,
  setFontColorPreset, setHighlightColorPreset, setSelectionColorPreset,
  type AppearanceResolvedColorMode
} from '../features/settings/model/appearanceColorSettings';
import { DEFAULT_APPEARANCE_COLORS } from '../shared/config/defaultAppearanceColors';

export const READING_COLOR_CONTROLS = {
  accent: { get: getAccentColorPreset, set: setAccentColorPreset, label: 'accent' },
  font: { get: getFontColorPreset, set: setFontColorPreset, label: 'fontColor' },
  selection: { get: getSelectionColorPreset, set: setSelectionColorPreset, label: 'selectionColor' },
  highlight: { get: getHighlightColorPreset, set: setHighlightColorPreset, label: 'highlightColor' },
  cloze: { get: getClozeColorPreset, set: setClozeColorPreset, label: 'clozeColor' }
} as const;
export type ReadingColor = keyof typeof READING_COLOR_CONTROLS;

function readColors(mode: AppearanceResolvedColorMode) {
  return Object.fromEntries(Object.entries(READING_COLOR_CONTROLS).map(([key, control]) => [key, control.get(mode)])) as Record<ReadingColor, string>;
}

export function useCompanionReadingColors(mode: AppearanceResolvedColorMode) {
  const [revision, setRevision] = useState(0);
  const [colorSaveError, setSaveError] = useState(false);
  const colors = readColors(mode);
  useLayoutEffect(() => {
    const current = readColors(mode);
    applyAppearanceColorSettings(document.documentElement, {
      mode, accentColor: current.accent, fontColor: current.font, selectionColor: current.selection,
      highlightColor: current.highlight, clozeColor: current.cloze
    });
  }, [mode, revision]);
  const updateReadingColor = (key: ReadingColor, value: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    try {
      READING_COLOR_CONTROLS[key].set(value, mode);
      setRevision(value => value + 1);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  return { colors, colorDefaults: DEFAULT_APPEARANCE_COLORS[mode], colorSaveError, updateReadingColor };
}

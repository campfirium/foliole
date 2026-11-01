import { useState } from 'react';

import {
  getImmersiveDoubleClickEditEnabled,
  getReadingContentWidth,
  getReadingLineHeight,
  getReadingParagraphSpacing
} from '../model/appearanceSettings';

import { useReadingFontWeightSettings } from './useReadingFontWeightSettings';

export function useReadingAppearanceState() {
  const readingFontWeightSettings = useReadingFontWeightSettings();
  const [immersiveDoubleClickEditEnabledState, setImmersiveDoubleClickEditEnabledState] =
    useState(() => getImmersiveDoubleClickEditEnabled());
  const [readingContentWidthState, setReadingContentWidthState] = useState(() => getReadingContentWidth());
  const [readingLineHeightState, setReadingLineHeightState] = useState(() => getReadingLineHeight());
  const [readingParagraphSpacingState, setReadingParagraphSpacingState] = useState(() => getReadingParagraphSpacing());
  return {
    readingFontWeightSettings,
    immersiveDoubleClickEditEnabledState,
    readingContentWidthState,
    readingLineHeightState,
    readingParagraphSpacingState,
    setImmersiveDoubleClickEditEnabledState,
    setReadingContentWidthState,
    setReadingLineHeightState,
    setReadingParagraphSpacingState
  };
}

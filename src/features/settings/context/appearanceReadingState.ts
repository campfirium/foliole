import { useState } from 'react';

import {
  getImmersiveDoubleClickEditEnabled,
  getReadingContentWidth,
  getReadingLineHeight,
  getReadingParagraphSpacing
} from '../model/appearanceSettings';

export function useReadingAppearanceState() {
  const [immersiveDoubleClickEditEnabledState, setImmersiveDoubleClickEditEnabledState] =
    useState(() => getImmersiveDoubleClickEditEnabled());
  const [readingContentWidthState, setReadingContentWidthState] = useState(() => getReadingContentWidth());
  const [readingLineHeightState, setReadingLineHeightState] = useState(() => getReadingLineHeight());
  const [readingParagraphSpacingState, setReadingParagraphSpacingState] = useState(() => getReadingParagraphSpacing());
  return {
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

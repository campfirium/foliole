import { useState } from 'react';

import {
  getReadingContentWidth,
  getReadingLineHeight,
  getReadingParagraphSpacing
} from '../model/appearanceSettings';

export function useReadingAppearanceState() {
  const [readingContentWidthState, setReadingContentWidthState] = useState(() => getReadingContentWidth());
  const [readingLineHeightState, setReadingLineHeightState] = useState(() => getReadingLineHeight());
  const [readingParagraphSpacingState, setReadingParagraphSpacingState] = useState(() => getReadingParagraphSpacing());
  return {
    readingContentWidthState,
    readingLineHeightState,
    readingParagraphSpacingState,
    setReadingContentWidthState,
    setReadingLineHeightState,
    setReadingParagraphSpacingState
  };
}

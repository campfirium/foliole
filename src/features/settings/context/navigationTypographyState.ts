import { useLayoutEffect, useState } from 'react';

import { DEFAULT_NAVIGATION_META_FONT_SIZE, DEFAULT_NAVIGATION_TITLE_FONT_SIZE, getNavigationMetaFontSize, getNavigationTitleFontSize, resolveNavigationMetaLineHeight, resolveNavigationTitleLineHeight, setNavigationMetaFontSize, setNavigationTitleFontSize } from '../../nodes/components/navigationTypographySettings';
import { getNodeListRowSpacing, setNodeListRowSpacing, DEFAULT_NODE_LIST_ROW_SPACING } from '../../nodes/components/nodeListRowSpacingSettings';

export function useNavigationTypographyState() {
  const [navigationTitleFontSizeState, setNavigationTitleFontSizeState] = useState(getNavigationTitleFontSize);
  const [navigationMetaFontSizeState, setNavigationMetaFontSizeState] = useState(getNavigationMetaFontSize);
  const [nodeListRowSpacingState, setNodeListRowSpacingState] = useState(getNodeListRowSpacing);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--navigation-title-font-size', `${navigationTitleFontSizeState}px`);
    root.style.setProperty('--navigation-title-line-height', `${resolveNavigationTitleLineHeight(navigationTitleFontSizeState)}px`);
    root.style.setProperty('--navigation-meta-font-size', `${navigationMetaFontSizeState}px`);
    root.style.setProperty('--navigation-meta-line-height', `${resolveNavigationMetaLineHeight(navigationMetaFontSizeState)}px`);
  }, [navigationMetaFontSizeState, navigationTitleFontSizeState]);

  return {
    navigationMetaFontSizeState,
    navigationTitleFontSizeState,
    nodeListRowSpacingState,
    resetNavigationMetaFontSize: () => setNavigationMetaFontSizeState(setNavigationMetaFontSize(DEFAULT_NAVIGATION_META_FONT_SIZE)),
    resetNavigationTitleFontSize: () => setNavigationTitleFontSizeState(setNavigationTitleFontSize(DEFAULT_NAVIGATION_TITLE_FONT_SIZE)),
    resetNodeListRowSpacing: () => (setNodeListRowSpacing(DEFAULT_NODE_LIST_ROW_SPACING), setNodeListRowSpacingState(DEFAULT_NODE_LIST_ROW_SPACING)),
    setNavigationMetaFontSize: (value: number) => setNavigationMetaFontSizeState(setNavigationMetaFontSize(value)),
    setNavigationTitleFontSize: (value: number) => setNavigationTitleFontSizeState(setNavigationTitleFontSize(value)),
    setNodeListRowSpacing: (value: number) => (setNodeListRowSpacing(value), setNodeListRowSpacingState(getNodeListRowSpacing()))
  };
}

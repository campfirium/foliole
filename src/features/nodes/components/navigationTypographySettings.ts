export const DEFAULT_NAVIGATION_TITLE_FONT_SIZE = 14;
export const DEFAULT_NAVIGATION_META_FONT_SIZE = 12;

export function getNavigationTitleFontSize() {
  return DEFAULT_NAVIGATION_TITLE_FONT_SIZE;
}

export function getNavigationMetaFontSize() {
  return DEFAULT_NAVIGATION_META_FONT_SIZE;
}

export function resolveNavigationTitleLineHeight(fontSize: number) {
  return Math.max(20, Math.ceil(fontSize * 1.4));
}

export function resolveNavigationMetaLineHeight(fontSize: number) {
  return Math.max(18, Math.ceil(fontSize * 1.4));
}

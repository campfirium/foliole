import {
  type AccentColorPreset,
  type ClozeColorPreset,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  getAccentColorPreset,
  getClozeColorPreset,
  getFontColorPreset,
  getHighlightColorPreset,
  getSelectionColorPreset,
  type FontColorPreset,
  type HighlightColorPreset,
  type SelectionColorPreset,
  setAccentColorPreset,
  setClozeColorPreset,
  setFontColorPreset,
  setHighlightColorPreset,
  setSelectionColorPreset
} from './appearanceColorSettings';
export {
  getReadingContentWidth,
  READING_CONTENT_WIDTH_DEFAULT,
  READING_CONTENT_WIDTH_MAX,
  READING_CONTENT_WIDTH_MIN,
  READING_CONTENT_WIDTH_STEP,
  setReadingContentWidth
} from './appearanceReadingWidth';
import {
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette,
  type WorkspaceSurfaceAssignments,
  type WorkspaceSurfacePalette
} from './workspaceSurfaceSettings';
export {
  getWorkspaceDividerOpacityPercent,
  setWorkspaceDividerOpacityPercent,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_MAX,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_MIN,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_STEP
} from './workspaceDividerSettings';
export { applyAppearanceSettings } from './applyAppearanceSettings';
export {
  type AccentColorPreset,
  type ClozeColorPreset,
  type FontColorPreset,
  type HighlightColorPreset,
  type SelectionColorPreset,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  getAccentColorPreset,
  getClozeColorPreset,
  getFontColorPreset,
  getHighlightColorPreset,
  getSelectionColorPreset,
  setAccentColorPreset,
  setClozeColorPreset,
  setFontColorPreset,
  setHighlightColorPreset,
  setSelectionColorPreset,
  type WorkspaceSurfaceAssignments,
  type WorkspaceSurfacePalette,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette
};
export {
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getMonospaceFontPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
} from './appearanceFontSettings';
export {
  getBaseColorMode,
  getDimImagesInDarkMode,
  getImmersiveDoubleClickEditEnabled,
  getPdfReadingMode,
  setBaseColorMode,
  setDimImagesInDarkMode,
  setImmersiveDoubleClickEditEnabled,
  setPdfReadingMode
} from './appearanceReadingModeSettings';
export {
  DEFAULT_READING_LINE_HEIGHT,
  DEFAULT_READING_PARAGRAPH_SPACING,
  INTERFACE_FONT_SIZE_DEFAULT,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  READING_LINE_HEIGHT_MAX,
  READING_LINE_HEIGHT_MIN,
  READING_LINE_HEIGHT_STEP,
  READING_PARAGRAPH_SPACING_MAX,
  READING_PARAGRAPH_SPACING_MIN,
  READING_PARAGRAPH_SPACING_STEP,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  type ReadingParagraphSpacing
} from './appearanceSettingsOptions';
export { getReadingLineHeight, setReadingLineHeight } from './appearanceReadingLineHeight';
export { getReadingParagraphSpacing, setReadingParagraphSpacing } from './appearanceReadingParagraphSpacing';

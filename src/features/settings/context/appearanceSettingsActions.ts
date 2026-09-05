import type { Dispatch, SetStateAction } from 'react';

import type { EditorDisplayMode } from '../../editor/model/editorDisplayMode';
import type { FrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import {
  type AccentColorPreset,
  type ClozeColorPreset,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  type HighlightColorPreset,
  type FontColorPreset,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  type ReadingParagraphSpacing,
  type SelectionColorPreset,
  setAccentColorPreset,
  setClozeColorPreset,
  setFontColorPreset,
  setHighlightColorPreset,
  setSelectionColorPreset,
  setWorkspaceDividerOpacityPercent,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette
} from '../model/appearanceSettings';
import type { BaseColorMode, ResolvedBaseColorMode } from '../model/baseColorMode';

import { createGeneralAppearanceActions } from './appearanceGeneralActions';
import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';

type Setter<T> = Dispatch<SetStateAction<T>>;

export type AppearanceState = {
  advanceBaseColorModeCycle: (resolvedMode: ResolvedBaseColorMode) => BaseColorMode;
  accentColorPresetState: AccentColorPreset;
  baseColorModeState: BaseColorMode;
  resolvedBaseColorModeState: ResolvedBaseColorMode;
  clozeColorPresetState: ClozeColorPreset;
  customInterfaceFontState: string;
  customMonospaceFontState: string;
  dimImagesInDarkModeState: boolean;
  editorDisplayModeState: EditorDisplayMode;
  fontColorPresetState: FontColorPreset;
  frontmatterDisplayModeState: FrontmatterDisplayMode;
  frontmatterMetaFieldsState: string;
  highlightColorPresetState: HighlightColorPreset;
  interfaceFontPresetState: InterfaceFontPreset;
  interfaceFontSizeState: number;
  immersiveDoubleClickEditEnabledState: boolean;
  isBaseColorModeSelectionActiveState: boolean;
  markdownSyntaxVisibilityState: MarkdownSyntaxVisibility;
  monospaceFontPresetState: MonospaceFontPreset;
  pdfReadingModeState: PdfReadingMode;
  readingLineHeightState: ReadingLineHeight;
  readingParagraphSpacingState: ReadingParagraphSpacing;
  readingContentWidthState: number;
  selectionColorPresetState: SelectionColorPreset;
  selectionToolbarEnabledState: boolean;
  selectionToolbarOpacityPercentState: number;
  workspaceDividerOpacityPercentState: number;
  workspaceSurfaceAssignmentsState: AppearanceSettingsContextValue['workspaceSurfaceAssignments'];
  workspaceSurfacePaletteState: AppearanceSettingsContextValue['workspaceSurfacePalette'];
  setAccentColorPresetState: Setter<AccentColorPreset>;
  setAutoLocalizeRemoteImagesState: Setter<boolean>;
  setBaseColorModeState: Setter<BaseColorMode>;
  setClozeColorPresetState: Setter<ClozeColorPreset>;
  setCustomInterfaceFontState: Setter<string>;
  setCustomMonospaceFontState: Setter<string>;
  setDimImagesInDarkModeState: Setter<boolean>;
  setEditorDisplayModeState: Setter<EditorDisplayMode>;
  setFontColorPresetState: Setter<FontColorPreset>;
  setFrontmatterDisplayModeState: Setter<FrontmatterDisplayMode>;
  setFrontmatterMetaFieldsState: Setter<string>;
  setHighlightColorPresetState: Setter<HighlightColorPreset>;
  setInterfaceFontPresetState: Setter<InterfaceFontPreset>;
  setInterfaceFontSizeState: Setter<number>;
  setImmersiveDoubleClickEditEnabledState: Setter<boolean>;
  setMarkdownSyntaxVisibilityState: Setter<MarkdownSyntaxVisibility>;
  setMonospaceFontPresetState: Setter<MonospaceFontPreset>;
  setPdfReadingModeState: Setter<PdfReadingMode>;
  setReadingContentWidthState: Setter<number>;
  setReadingLineHeightState: Setter<ReadingLineHeight>;
  setReadingParagraphSpacingState: Setter<ReadingParagraphSpacing>;
  setSelectionColorPresetState: Setter<SelectionColorPreset>;
  setSelectionToolbarEnabledState: Setter<boolean>;
  setSelectionToolbarOpacityPercentState: Setter<number>;
  setResolvedBaseColorModeState: Setter<ResolvedBaseColorMode>;
  setWorkspaceDividerOpacityPercentState: Setter<number>;
  setWorkspaceSurfaceAssignmentsState: Setter<AppearanceSettingsContextValue['workspaceSurfaceAssignments']>;
  setWorkspaceSurfacePaletteState: Setter<AppearanceSettingsContextValue['workspaceSurfacePalette']>;
};

function clampAssignmentsToPalette(state: AppearanceState, palette: typeof state.workspaceSurfacePaletteState) {
  return Object.fromEntries(
    Object.entries(state.workspaceSurfaceAssignmentsState).map(([regionId, assignment]) => [
      regionId,
      Math.min(Math.max(Math.round(assignment), 0), Math.max(palette.length - 1, 0))
    ])
  ) as typeof state.workspaceSurfaceAssignmentsState;
}

function createWorkspaceSurfaceActions(state: AppearanceState) {
  const defaultPalette = state.resolvedBaseColorModeState === 'dark'
    ? DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE
    : DEFAULT_WORKSPACE_SURFACE_PALETTE;
  return {
    resetWorkspaceSurfaceSettings: () => {
      setWorkspaceSurfacePalette(defaultPalette, state.resolvedBaseColorModeState);
      setWorkspaceSurfaceAssignments(
        DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
        defaultPalette.length,
        state.resolvedBaseColorModeState
      );
      state.setWorkspaceSurfacePaletteState(defaultPalette);
      state.setWorkspaceSurfaceAssignmentsState(DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS);
    },
    setWorkspaceSurfaceAssignments: (value: typeof state.workspaceSurfaceAssignmentsState) => {
      setWorkspaceSurfaceAssignments(value, state.workspaceSurfacePaletteState.length, state.resolvedBaseColorModeState);
      state.setWorkspaceSurfaceAssignmentsState(value);
    },
    setWorkspaceDividerOpacityPercent: (value: number) => {
      state.setWorkspaceDividerOpacityPercentState(setWorkspaceDividerOpacityPercent(value));
    },
    setWorkspaceSurfacePalette: (value: typeof state.workspaceSurfacePaletteState) => {
      const nextAssignments = clampAssignmentsToPalette(state, value);
      setWorkspaceSurfacePalette(value, state.resolvedBaseColorModeState);
      setWorkspaceSurfaceAssignments(nextAssignments, value.length, state.resolvedBaseColorModeState);
      state.setWorkspaceSurfacePaletteState(value);
      state.setWorkspaceSurfaceAssignmentsState(nextAssignments);
    }
  };
}

function getDefaultAccentColor(mode: ResolvedBaseColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_ACCENT_COLOR_PRESET : DEFAULT_ACCENT_COLOR_PRESET;
}

function getDefaultClozeColor(mode: ResolvedBaseColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_CLOZE_COLOR_PRESET : DEFAULT_CLOZE_COLOR_PRESET;
}

function getDefaultFontColor(mode: ResolvedBaseColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_FONT_COLOR_PRESET : DEFAULT_FONT_COLOR_PRESET;
}

function getDefaultHighlightColor(mode: ResolvedBaseColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET : DEFAULT_HIGHLIGHT_COLOR_PRESET;
}

function getDefaultSelectionColor(mode: ResolvedBaseColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_SELECTION_COLOR_PRESET : DEFAULT_SELECTION_COLOR_PRESET;
}

function createColorPresetActions(state: AppearanceState) {
  return {
    resetAccentColorPreset: () => {
      const value = getDefaultAccentColor(state.resolvedBaseColorModeState);
      setAccentColorPreset(value, state.resolvedBaseColorModeState);
      state.setAccentColorPresetState(value);
    },
    resetClozeColorPreset: () => {
      const value = getDefaultClozeColor(state.resolvedBaseColorModeState);
      setClozeColorPreset(value, state.resolvedBaseColorModeState);
      state.setClozeColorPresetState(value);
    },
    resetFontColorPreset: () => {
      const value = getDefaultFontColor(state.resolvedBaseColorModeState);
      setFontColorPreset(value, state.resolvedBaseColorModeState);
      state.setFontColorPresetState(value);
    },
    resetHighlightColorPreset: () => {
      const value = getDefaultHighlightColor(state.resolvedBaseColorModeState);
      setHighlightColorPreset(value, state.resolvedBaseColorModeState);
      state.setHighlightColorPresetState(value);
    },
    resetSelectionColorPreset: () => {
      const value = getDefaultSelectionColor(state.resolvedBaseColorModeState);
      setSelectionColorPreset(value, state.resolvedBaseColorModeState);
      state.setSelectionColorPresetState(value);
    },
    setAccentColorPreset: (value: AccentColorPreset) => (setAccentColorPreset(value, state.resolvedBaseColorModeState), state.setAccentColorPresetState(value)),
    setClozeColorPreset: (value: ClozeColorPreset) => (setClozeColorPreset(value, state.resolvedBaseColorModeState), state.setClozeColorPresetState(value)),
    setFontColorPreset: (value: FontColorPreset) => (setFontColorPreset(value, state.resolvedBaseColorModeState), state.setFontColorPresetState(value)),
    setHighlightColorPreset: (value: HighlightColorPreset) => (setHighlightColorPreset(value, state.resolvedBaseColorModeState), state.setHighlightColorPresetState(value)),
    setSelectionColorPreset: (value: SelectionColorPreset) => (setSelectionColorPreset(value, state.resolvedBaseColorModeState), state.setSelectionColorPresetState(value))
  };
}

export function createAppearanceActions(state: AppearanceState) {
  return {
    ...createColorPresetActions(state),
    ...createGeneralAppearanceActions(state),
    ...createWorkspaceSurfaceActions(state)
  };
}

import type { Dispatch, SetStateAction } from 'react';

import { type EditorDisplayMode, setEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { type MarkdownSyntaxVisibility, setMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { setAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
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
  INTERFACE_FONT_SIZE_DEFAULT,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  type SelectionColorPreset,
  setDimImagesInDarkMode,
  setAccentColorPreset,
  setBaseColorMode,
  setClozeColorPreset,
  setFontColorPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setHighlightColorPreset,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setPdfReadingMode,
  setReadingLineHeight,
  setSelectionColorPreset,
  setUiFontPreset,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette
} from '../model/appearanceSettings';
import type { BaseColorMode, ResolvedBaseColorMode } from '../model/baseColorMode';

import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';

type Setter<T> = Dispatch<SetStateAction<T>>;

type AppearanceState = {
  accentColorPresetState: AccentColorPreset;
  baseColorModeState: BaseColorMode;
  resolvedBaseColorModeState: ResolvedBaseColorMode;
  clozeColorPresetState: ClozeColorPreset;
  customInterfaceFontState: string;
  customMonospaceFontState: string;
  customUiFontState: string;
  dimImagesInDarkModeState: boolean;
  editorDisplayModeState: EditorDisplayMode;
  fontColorPresetState: FontColorPreset;
  highlightColorPresetState: HighlightColorPreset;
  interfaceFontPresetState: InterfaceFontPreset;
  interfaceFontSizeState: number;
  markdownSyntaxVisibilityState: MarkdownSyntaxVisibility;
  monospaceFontPresetState: MonospaceFontPreset;
  pdfReadingModeState: PdfReadingMode;
  readingLineHeightState: ReadingLineHeight;
  selectionColorPresetState: SelectionColorPreset;
  uiFontPresetState: InterfaceFontPreset;
  workspaceSurfaceAssignmentsState: AppearanceSettingsContextValue['workspaceSurfaceAssignments'];
  workspaceSurfacePaletteState: AppearanceSettingsContextValue['workspaceSurfacePalette'];
  setAccentColorPresetState: Setter<AccentColorPreset>;
  setAutoLocalizeRemoteImagesState: Setter<boolean>;
  setBaseColorModeState: Setter<BaseColorMode>;
  setClozeColorPresetState: Setter<ClozeColorPreset>;
  setCustomInterfaceFontState: Setter<string>;
  setCustomMonospaceFontState: Setter<string>;
  setCustomUiFontState: Setter<string>;
  setDimImagesInDarkModeState: Setter<boolean>;
  setEditorDisplayModeState: Setter<EditorDisplayMode>;
  setFontColorPresetState: Setter<FontColorPreset>;
  setHighlightColorPresetState: Setter<HighlightColorPreset>;
  setInterfaceFontPresetState: Setter<InterfaceFontPreset>;
  setInterfaceFontSizeState: Setter<number>;
  setMarkdownSyntaxVisibilityState: Setter<MarkdownSyntaxVisibility>;
  setMonospaceFontPresetState: Setter<MonospaceFontPreset>;
  setPdfReadingModeState: Setter<PdfReadingMode>;
  setReadingLineHeightState: Setter<ReadingLineHeight>;
  setSelectionColorPresetState: Setter<SelectionColorPreset>;
  setUiFontPresetState: Setter<InterfaceFontPreset>;
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

type AppearanceActions = Pick<
  AppearanceSettingsContextValue,
  | 'resetAccentColorPreset'
  | 'resetClozeColorPreset'
  | 'resetFontColorPreset'
  | 'resetHighlightColorPreset'
  | 'resetInterfaceFontSize'
  | 'resetSelectionColorPreset'
  | 'resetWorkspaceSurfaceSettings'
  | 'setAccentColorPreset'
  | 'setAutoLocalizeRemoteImages'
  | 'setBaseColorMode'
  | 'setClozeColorPreset'
  | 'setCustomInterfaceFont'
  | 'setCustomMonospaceFont'
  | 'setCustomUiFont'
  | 'setDimImagesInDarkMode'
  | 'setFontColorPreset'
  | 'setHighlightColorPreset'
  | 'setInterfaceFontPreset'
  | 'setInterfaceFontSize'
  | 'setMarkdownSyntaxVisibility'
  | 'setMonospaceFontPreset'
  | 'setPdfReadingMode'
  | 'setReadingLineHeight'
  | 'setSelectionColorPreset'
  | 'setUiFontPreset'
  | 'setWorkspaceSurfaceAssignments'
  | 'setWorkspaceSurfacePalette'
  | 'toggleBaseColorMode'
  | 'toggleEditorDisplayMode'
>;

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

function createGeneralAppearanceActions(state: AppearanceState) {
  return {
    resetInterfaceFontSize: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), state.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    setAutoLocalizeRemoteImages: (value: boolean) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: (value: BaseColorMode) => (setBaseColorMode(value), state.setBaseColorModeState(value)),
    setCustomInterfaceFont: (value: string) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value: string) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setCustomUiFont: (value: string) => (setCustomUiFont(value), state.setCustomUiFontState(value)),
    setDimImagesInDarkMode: (value: boolean) => (setDimImagesInDarkMode(value), state.setDimImagesInDarkModeState(value)),
    setInterfaceFontPreset: (value: InterfaceFontPreset) => (setInterfaceFontPreset(value), state.setInterfaceFontPresetState(value)),
    setInterfaceFontSize: (value: number) => (setInterfaceFontSize(value), state.setInterfaceFontSizeState(value)),
    setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => (setMarkdownSyntaxVisibility(value), state.setMarkdownSyntaxVisibilityState(value)),
    setMonospaceFontPreset: (value: MonospaceFontPreset) => (setMonospaceFontPreset(value), state.setMonospaceFontPresetState(value)),
    setPdfReadingMode: (value: PdfReadingMode) => (setPdfReadingMode(value), state.setPdfReadingModeState(value)),
    setReadingLineHeight: (value: ReadingLineHeight) => (setReadingLineHeight(value), state.setReadingLineHeightState(value)),
    setUiFontPreset: (value: InterfaceFontPreset) => (setUiFontPreset(value), state.setUiFontPresetState(value)),
    toggleBaseColorMode: () => {
      const next = state.resolvedBaseColorModeState === 'dark' ? 'light' : 'dark';
      setBaseColorMode(next);
      state.setBaseColorModeState(next);
    },
    toggleEditorDisplayMode: () => {
      const next = state.editorDisplayModeState === 'preview' ? 'source' : 'preview';
      state.setEditorDisplayModeState(next);
      return setEditorDisplayMode(next);
    }
  };
}

export function createAppearanceActions(state: AppearanceState): AppearanceActions {
  return {
    ...createColorPresetActions(state),
    ...createGeneralAppearanceActions(state),
    ...createWorkspaceSurfaceActions(state)
  };
}

import type { Dispatch, SetStateAction } from 'react';

import { type EditorDisplayMode, setEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { type MarkdownSyntaxVisibility, setMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { setAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
import {
  type AccentColorPreset,
  type BaseColorMode,
  type ClozeColorPreset,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  type HighlightColorPreset,
  INTERFACE_FONT_SIZE_DEFAULT,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type SelectionColorPreset,
  setAccentColorPreset,
  setBaseColorMode,
  setClozeColorPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setHighlightColorPreset,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setSelectionColorPreset,
  setUiFontPreset,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette
} from '../model/appearanceSettings';

import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';

type Setter<T> = Dispatch<SetStateAction<T>>;

type AppearanceState = {
  accentColorPresetState: AccentColorPreset;
  baseColorModeState: BaseColorMode;
  clozeColorPresetState: ClozeColorPreset;
  customInterfaceFontState: string;
  customMonospaceFontState: string;
  customUiFontState: string;
  editorDisplayModeState: EditorDisplayMode;
  highlightColorPresetState: HighlightColorPreset;
  interfaceFontPresetState: InterfaceFontPreset;
  interfaceFontSizeState: number;
  markdownSyntaxVisibilityState: MarkdownSyntaxVisibility;
  monospaceFontPresetState: MonospaceFontPreset;
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
  setEditorDisplayModeState: Setter<EditorDisplayMode>;
  setHighlightColorPresetState: Setter<HighlightColorPreset>;
  setInterfaceFontPresetState: Setter<InterfaceFontPreset>;
  setInterfaceFontSizeState: Setter<number>;
  setMarkdownSyntaxVisibilityState: Setter<MarkdownSyntaxVisibility>;
  setMonospaceFontPresetState: Setter<MonospaceFontPreset>;
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
  return {
    resetWorkspaceSurfaceSettings: () => {
      setWorkspaceSurfacePalette(DEFAULT_WORKSPACE_SURFACE_PALETTE);
      setWorkspaceSurfaceAssignments(
        DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
        DEFAULT_WORKSPACE_SURFACE_PALETTE.length
      );
      state.setWorkspaceSurfacePaletteState(DEFAULT_WORKSPACE_SURFACE_PALETTE);
      state.setWorkspaceSurfaceAssignmentsState(DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS);
    },
    setWorkspaceSurfaceAssignments: (value: typeof state.workspaceSurfaceAssignmentsState) => {
      setWorkspaceSurfaceAssignments(value, state.workspaceSurfacePaletteState.length);
      state.setWorkspaceSurfaceAssignmentsState(value);
    },
    setWorkspaceSurfacePalette: (value: typeof state.workspaceSurfacePaletteState) => {
      const nextAssignments = clampAssignmentsToPalette(state, value);
      setWorkspaceSurfacePalette(value);
      setWorkspaceSurfaceAssignments(nextAssignments, value.length);
      state.setWorkspaceSurfacePaletteState(value);
      state.setWorkspaceSurfaceAssignmentsState(nextAssignments);
    }
  };
}

export function createAppearanceActions(
  state: AppearanceState
): Pick<
  AppearanceSettingsContextValue,
  | 'resetAccentColorPreset'
  | 'resetClozeColorPreset'
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
  | 'setHighlightColorPreset'
  | 'setInterfaceFontPreset'
  | 'setInterfaceFontSize'
  | 'setMarkdownSyntaxVisibility'
  | 'setMonospaceFontPreset'
  | 'setSelectionColorPreset'
  | 'setUiFontPreset'
  | 'setWorkspaceSurfaceAssignments'
  | 'setWorkspaceSurfacePalette'
  | 'toggleEditorDisplayMode'
> {
  return {
    resetAccentColorPreset: () => (setAccentColorPreset(DEFAULT_ACCENT_COLOR_PRESET), state.setAccentColorPresetState(DEFAULT_ACCENT_COLOR_PRESET)),
    resetClozeColorPreset: () => (setClozeColorPreset(DEFAULT_CLOZE_COLOR_PRESET), state.setClozeColorPresetState(DEFAULT_CLOZE_COLOR_PRESET)),
    resetHighlightColorPreset: () => (setHighlightColorPreset(DEFAULT_HIGHLIGHT_COLOR_PRESET), state.setHighlightColorPresetState(DEFAULT_HIGHLIGHT_COLOR_PRESET)),
    resetInterfaceFontSize: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), state.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    resetSelectionColorPreset: () => (setSelectionColorPreset(DEFAULT_SELECTION_COLOR_PRESET), state.setSelectionColorPresetState(DEFAULT_SELECTION_COLOR_PRESET)),
    setAccentColorPreset: (value) => (setAccentColorPreset(value), state.setAccentColorPresetState(value)),
    setAutoLocalizeRemoteImages: (value) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: (value) => (setBaseColorMode(value), state.setBaseColorModeState(value)),
    setClozeColorPreset: (value) => (setClozeColorPreset(value), state.setClozeColorPresetState(value)),
    setCustomInterfaceFont: (value) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setCustomUiFont: (value) => (setCustomUiFont(value), state.setCustomUiFontState(value)),
    setHighlightColorPreset: (value) => (setHighlightColorPreset(value), state.setHighlightColorPresetState(value)),
    setInterfaceFontPreset: (value) => (setInterfaceFontPreset(value), state.setInterfaceFontPresetState(value)),
    setInterfaceFontSize: (value) => (setInterfaceFontSize(value), state.setInterfaceFontSizeState(value)),
    setMarkdownSyntaxVisibility: (value) => (setMarkdownSyntaxVisibility(value), state.setMarkdownSyntaxVisibilityState(value)),
    setMonospaceFontPreset: (value) => (setMonospaceFontPreset(value), state.setMonospaceFontPresetState(value)),
    setSelectionColorPreset: (value) => (setSelectionColorPreset(value), state.setSelectionColorPresetState(value)),
    setUiFontPreset: (value) => (setUiFontPreset(value), state.setUiFontPresetState(value)),
    toggleEditorDisplayMode: () => {
      const next = state.editorDisplayModeState === 'preview' ? 'source' : 'preview';
      state.setEditorDisplayModeState(next);
      return setEditorDisplayMode(next);
    },
    ...createWorkspaceSurfaceActions(state)
  };
}

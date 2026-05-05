import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { getEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { shouldAutoLocalizeRemoteImages as getAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
import {
  applyAppearanceSettings,
  getAccentColorPreset,
  getBaseColorMode,
  getClozeColorPreset,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getHighlightColorPreset,
  getSelectionColorPreset,
  getMonospaceFontPreset,
  getUiFontPreset,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette
} from '../model/appearanceSettings';

import { createAppearanceActions } from './appearanceSettingsActions';
import { AppearanceSettingsContext, useAppearanceSettings } from './appearanceSettingsContext';

function useAppearanceStateValues() {
  const [autoLocalizeRemoteImagesState, setAutoLocalizeRemoteImagesState] = useState(() => getAutoLocalizeRemoteImages());
  const [markdownSyntaxVisibilityState, setMarkdownSyntaxVisibilityState] = useState(() => getMarkdownSyntaxVisibility());
  const [editorDisplayModeState, setEditorDisplayModeState] = useState(() => getEditorDisplayMode());
  const [baseColorModeState, setBaseColorModeState] = useState(() => getBaseColorMode());
  const [accentColorPresetState, setAccentColorPresetState] = useState(() => getAccentColorPreset());
  const [selectionColorPresetState, setSelectionColorPresetState] = useState(() => getSelectionColorPreset());
  const [highlightColorPresetState, setHighlightColorPresetState] = useState(() => getHighlightColorPreset());
  const [clozeColorPresetState, setClozeColorPresetState] = useState(() => getClozeColorPreset());
  const [uiFontPresetState, setUiFontPresetState] = useState(() => getUiFontPreset());
  const [customUiFontState, setCustomUiFontState] = useState(() => getCustomUiFont());
  const [interfaceFontPresetState, setInterfaceFontPresetState] = useState(() => getInterfaceFontPreset());
  const [customInterfaceFontState, setCustomInterfaceFontState] = useState(() => getCustomInterfaceFont());
  const [monospaceFontPresetState, setMonospaceFontPresetState] = useState(() => getMonospaceFontPreset());
  const [customMonospaceFontState, setCustomMonospaceFontState] = useState(() => getCustomMonospaceFont());
  const [interfaceFontSizeState, setInterfaceFontSizeState] = useState(() => getInterfaceFontSize());
  const [workspaceSurfacePaletteState, setWorkspaceSurfacePaletteState] = useState(() => getWorkspaceSurfacePalette());
  const [workspaceSurfaceAssignmentsState, setWorkspaceSurfaceAssignmentsState] = useState(() =>
    getWorkspaceSurfaceAssignments()
  );

  return {
    accentColorPresetState,
    autoLocalizeRemoteImagesState,
    baseColorModeState,
    clozeColorPresetState,
    customInterfaceFontState,
    customMonospaceFontState,
    customUiFontState,
    editorDisplayModeState,
    highlightColorPresetState,
    interfaceFontPresetState,
    interfaceFontSizeState,
    markdownSyntaxVisibilityState,
    monospaceFontPresetState,
    selectionColorPresetState,
    setAccentColorPresetState,
    setAutoLocalizeRemoteImagesState,
    setBaseColorModeState,
    setClozeColorPresetState,
    setCustomInterfaceFontState,
    setCustomMonospaceFontState,
    setCustomUiFontState,
    setEditorDisplayModeState,
    setHighlightColorPresetState,
    setInterfaceFontPresetState,
    setInterfaceFontSizeState,
    setMarkdownSyntaxVisibilityState,
    setMonospaceFontPresetState,
    setSelectionColorPresetState,
    setUiFontPresetState,
    setWorkspaceSurfaceAssignmentsState,
    setWorkspaceSurfacePaletteState,
    uiFontPresetState,
    workspaceSurfaceAssignmentsState,
    workspaceSurfacePaletteState
  };
}

function useAppearanceSideEffects(state: ReturnType<typeof useAppearanceStateValues>) {
  useEffect(() => {
    applyAppearanceSettings({
      accentColor: state.accentColorPresetState,
      baseColor: state.baseColorModeState,
      clozeColor: state.clozeColorPresetState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      highlightColor: state.highlightColorPresetState,
      selectionColor: state.selectionColorPresetState,
      interfaceFont: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      monospaceFont: state.monospaceFontPresetState,
      uiFont: state.uiFontPresetState,
      workspaceSurfaceAssignments: state.workspaceSurfaceAssignmentsState,
      workspaceSurfacePalette: state.workspaceSurfacePaletteState
    });
  }, [
    state.accentColorPresetState,
    state.baseColorModeState,
    state.clozeColorPresetState,
    state.customInterfaceFontState,
    state.customMonospaceFontState,
    state.customUiFontState,
    state.highlightColorPresetState,
    state.interfaceFontPresetState,
    state.interfaceFontSizeState,
    state.monospaceFontPresetState,
    state.selectionColorPresetState,
    state.uiFontPresetState,
    state.workspaceSurfaceAssignmentsState,
    state.workspaceSurfacePaletteState
  ]);
}

function useAppearanceSettingsState() {
  const state = useAppearanceStateValues();
  useAppearanceSideEffects(state);

  return useMemo(
    () => ({
      accentColorPreset: state.accentColorPresetState,
      autoLocalizeRemoteImages: state.autoLocalizeRemoteImagesState,
      baseColorMode: state.baseColorModeState,
      clozeColorPreset: state.clozeColorPresetState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      editorAppearanceKey: `${state.markdownSyntaxVisibilityState}-${state.editorDisplayModeState}`,
      editorDisplayMode: state.editorDisplayModeState,
      highlightColorPreset: state.highlightColorPresetState,
      selectionColorPreset: state.selectionColorPresetState,
      interfaceFontPreset: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      markdownSyntaxVisibility: state.markdownSyntaxVisibilityState,
      monospaceFontPreset: state.monospaceFontPresetState,
      uiFontPreset: state.uiFontPresetState,
      workspaceSurfaceAssignments: state.workspaceSurfaceAssignmentsState,
      workspaceSurfacePalette: state.workspaceSurfacePaletteState,
      ...createAppearanceActions(state)
    }),
    [
      state.accentColorPresetState,
      state.autoLocalizeRemoteImagesState,
      state.baseColorModeState,
      state.clozeColorPresetState,
      state.customInterfaceFontState,
      state.customMonospaceFontState,
      state.customUiFontState,
      state.editorDisplayModeState,
      state.highlightColorPresetState,
      state.selectionColorPresetState,
      state.interfaceFontPresetState,
      state.interfaceFontSizeState,
      state.markdownSyntaxVisibilityState,
      state.monospaceFontPresetState,
      state.uiFontPresetState,
      state.workspaceSurfaceAssignmentsState,
      state.workspaceSurfacePaletteState
    ]
  );
}

export function AppearanceSettingsProvider({ children }: { children: ReactNode }) {
  const value = useAppearanceSettingsState();
  return <AppearanceSettingsContext.Provider value={value}>{children}</AppearanceSettingsContext.Provider>;
}

export { useAppearanceSettings };

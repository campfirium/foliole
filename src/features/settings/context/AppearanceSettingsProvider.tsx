import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

import {
  applyAppearanceSettings,
  getAccentColorPreset,
  getBaseColorMode,
  getClozeColorPreset,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getDimImagesInDarkMode,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getFontColorPreset,
  getHighlightColorPreset,
  getPdfReadingMode,
  getReadingContentWidth,
  getReadingLineHeight,
  getSelectionColorPreset,
  getMonospaceFontPreset,
  getUiFontPreset,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette
} from '../model/appearanceSettings';
import { resolveBaseColorMode } from '../model/baseColorMode';

import { useEditorSettingsStateValues } from './appearanceEditorState';
import { AppearanceSettingsContext, useAppearanceSettings } from './appearanceSettingsContext';
import { useAppearanceSettingsValue } from './appearanceSettingsValue';

const usePrePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function getInitialAppearanceModeState() {
  const baseColorMode = getBaseColorMode();
  const resolvedBaseColorMode = resolveBaseColorMode(baseColorMode);
  return { baseColorMode, resolvedBaseColorMode };
}

function useModeScopedAppearanceState(resolvedBaseColorMode: 'dark' | 'light') {
  const [accentColorPresetState, setAccentColorPresetState] = useState(() => getAccentColorPreset(resolvedBaseColorMode));
  const [fontColorPresetState, setFontColorPresetState] = useState(() => getFontColorPreset(resolvedBaseColorMode));
  const [selectionColorPresetState, setSelectionColorPresetState] = useState(() => getSelectionColorPreset(resolvedBaseColorMode));
  const [highlightColorPresetState, setHighlightColorPresetState] = useState(() => getHighlightColorPreset(resolvedBaseColorMode));
  const [clozeColorPresetState, setClozeColorPresetState] = useState(() => getClozeColorPreset(resolvedBaseColorMode));
  const [workspaceSurfacePaletteState, setWorkspaceSurfacePaletteState] = useState(() => getWorkspaceSurfacePalette(resolvedBaseColorMode));
  const [workspaceSurfaceAssignmentsState, setWorkspaceSurfaceAssignmentsState] = useState(() => getWorkspaceSurfaceAssignments(resolvedBaseColorMode));
  return {
    accentColorPresetState,
    clozeColorPresetState,
    fontColorPresetState,
    highlightColorPresetState,
    selectionColorPresetState,
    setAccentColorPresetState,
    setClozeColorPresetState,
    setFontColorPresetState,
    setHighlightColorPresetState,
    setSelectionColorPresetState,
    setWorkspaceSurfaceAssignmentsState,
    setWorkspaceSurfacePaletteState,
    workspaceSurfaceAssignmentsState,
    workspaceSurfacePaletteState
  };
}

export function useAppearanceStateValues() {
  const initialModeState = getInitialAppearanceModeState();
  const editorSettings = useEditorSettingsStateValues();
  const modeScoped = useModeScopedAppearanceState(initialModeState.resolvedBaseColorMode);
  const [baseColorModeState, setBaseColorModeState] = useState(() => initialModeState.baseColorMode);
  const [dimImagesInDarkModeState, setDimImagesInDarkModeState] = useState(() => getDimImagesInDarkMode());
  const [resolvedBaseColorModeState, setResolvedBaseColorModeState] = useState(() => initialModeState.resolvedBaseColorMode);
  const [pdfReadingModeState, setPdfReadingModeState] = useState(() => getPdfReadingMode());
  const [readingContentWidthState, setReadingContentWidthState] = useState(() => getReadingContentWidth());
  const [readingLineHeightState, setReadingLineHeightState] = useState(() => getReadingLineHeight());
  const [uiFontPresetState, setUiFontPresetState] = useState(() => getUiFontPreset());
  const [customUiFontState, setCustomUiFontState] = useState(() => getCustomUiFont());
  const [interfaceFontPresetState, setInterfaceFontPresetState] = useState(() => getInterfaceFontPreset());
  const [customInterfaceFontState, setCustomInterfaceFontState] = useState(() => getCustomInterfaceFont());
  const [monospaceFontPresetState, setMonospaceFontPresetState] = useState(() => getMonospaceFontPreset());
  const [customMonospaceFontState, setCustomMonospaceFontState] = useState(() => getCustomMonospaceFont());
  const [interfaceFontSizeState, setInterfaceFontSizeState] = useState(() => getInterfaceFontSize());

  return {
    ...modeScoped,
    ...editorSettings,
    baseColorModeState,
    dimImagesInDarkModeState,
    customInterfaceFontState,
    customMonospaceFontState,
    customUiFontState,
    interfaceFontPresetState,
    interfaceFontSizeState,
    monospaceFontPresetState,
    pdfReadingModeState,
    readingContentWidthState,
    readingLineHeightState,
    resolvedBaseColorModeState,
    setBaseColorModeState,
    setDimImagesInDarkModeState,
    setCustomInterfaceFontState,
    setCustomMonospaceFontState,
    setCustomUiFontState,
    setInterfaceFontPresetState,
    setInterfaceFontSizeState,
    setMonospaceFontPresetState,
    setPdfReadingModeState,
    setReadingContentWidthState,
    setReadingLineHeightState,
    setResolvedBaseColorModeState,
    setUiFontPresetState,
    uiFontPresetState
  };
}

function applyModeScopedAppearanceState(
  state: ReturnType<typeof useAppearanceStateValues>,
  nextState: ReturnType<typeof readModeScopedAppearanceState>
) {
  state.setAccentColorPresetState(nextState.accentColorPreset);
  state.setSelectionColorPresetState(nextState.selectionColorPreset);
  state.setFontColorPresetState(nextState.fontColorPreset);
  state.setHighlightColorPresetState(nextState.highlightColorPreset);
  state.setClozeColorPresetState(nextState.clozeColorPreset);
  state.setWorkspaceSurfacePaletteState(nextState.workspaceSurfacePalette);
  state.setWorkspaceSurfaceAssignmentsState(nextState.workspaceSurfaceAssignments);
}

function readModeScopedAppearanceState(resolvedBaseColorMode: 'dark' | 'light') {
  return {
    accentColorPreset: getAccentColorPreset(resolvedBaseColorMode),
    clozeColorPreset: getClozeColorPreset(resolvedBaseColorMode),
    fontColorPreset: getFontColorPreset(resolvedBaseColorMode),
    highlightColorPreset: getHighlightColorPreset(resolvedBaseColorMode),
    selectionColorPreset: getSelectionColorPreset(resolvedBaseColorMode),
    workspaceSurfaceAssignments: getWorkspaceSurfaceAssignments(resolvedBaseColorMode),
    workspaceSurfacePalette: getWorkspaceSurfacePalette(resolvedBaseColorMode)
  };
}

function useResolvedBaseColorEffect(state: ReturnType<typeof useAppearanceStateValues>) {
  useEffect(() => {
    const updateResolvedMode = () => {
      state.setResolvedBaseColorModeState(resolveBaseColorMode(state.baseColorModeState));
    };
    updateResolvedMode();
    if (state.baseColorModeState !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateResolvedMode);
    return () => mediaQuery.removeEventListener('change', updateResolvedMode);
  }, [state.baseColorModeState, state.setResolvedBaseColorModeState]);
}

function useModeScopedAppearanceEffect(state: ReturnType<typeof useAppearanceStateValues>) {
  useEffect(() => {
    const nextState = readModeScopedAppearanceState(state.resolvedBaseColorModeState);
    applyModeScopedAppearanceState(state, nextState);
  }, [state.resolvedBaseColorModeState]);
}

function useApplyAppearanceEffect(state: ReturnType<typeof useAppearanceStateValues>) {
  usePrePaintEffect(() => {
    applyAppearanceSettings({
      accentColor: state.accentColorPresetState,
      baseColor: state.baseColorModeState,
      resolvedBaseColor: state.resolvedBaseColorModeState,
      dimImagesInDarkMode: state.dimImagesInDarkModeState,
      pdfReadingMode: state.pdfReadingModeState,
      readingContentWidth: state.readingContentWidthState,
      readingLineHeight: state.readingLineHeightState,
      clozeColor: state.clozeColorPresetState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      fontColor: state.fontColorPresetState,
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
    state.dimImagesInDarkModeState,
    state.fontColorPresetState,
    state.highlightColorPresetState,
    state.interfaceFontPresetState,
    state.interfaceFontSizeState,
    state.monospaceFontPresetState,
    state.pdfReadingModeState,
    state.readingContentWidthState,
    state.readingLineHeightState,
    state.selectionColorPresetState,
    state.resolvedBaseColorModeState,
    state.uiFontPresetState,
    state.workspaceSurfaceAssignmentsState,
    state.workspaceSurfacePaletteState
  ]);
}

function useAppearanceSideEffects(state: ReturnType<typeof useAppearanceStateValues>) {
  useResolvedBaseColorEffect(state);
  useModeScopedAppearanceEffect(state);
  useApplyAppearanceEffect(state);
}

function useAppearanceSettingsState() {
  const state = useAppearanceStateValues();
  useAppearanceSideEffects(state);
  return useAppearanceSettingsValue(state);
}

export function AppearanceSettingsProvider({ children }: { children: ReactNode }) {
  const value = useAppearanceSettingsState();
  return <AppearanceSettingsContext.Provider value={value}>{children}</AppearanceSettingsContext.Provider>;
}

export { useAppearanceSettings };

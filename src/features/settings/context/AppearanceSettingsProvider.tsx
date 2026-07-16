import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

import { applySelectionToolbarOpacityPercent } from '../../editor/model/selectionToolbarSettings';
import {
  applyAppearanceSettings,
  getAccentColorPreset,
  getClozeColorPreset,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getDimImagesInDarkMode,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getFontColorPreset,
  getHighlightColorPreset,
  getPdfReadingMode,
  getSelectionColorPreset,
  getMonospaceFontPreset,
  getWorkspaceDividerOpacityPercent,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette
} from '../model/appearanceSettings';
import { resolveBaseColorMode } from '../model/baseColorMode';

import { useEditorSettingsStateValues } from './appearanceEditorState';
import { getInitialAppearanceModeState } from './appearanceModeState';
import { useReadingAppearanceState } from './appearanceReadingState';
import { AppearanceSettingsContext, useAppearanceSettings, useOptionalAppearanceSettings } from './appearanceSettingsContext';
import { useAppearanceSettingsValue } from './appearanceSettingsValue';
import { useNavigationTypographyState } from './navigationTypographyState';

const usePrePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  const readingSettings = useReadingAppearanceState();
  const navigationTypography = useNavigationTypographyState();
  const modeScoped = useModeScopedAppearanceState(initialModeState.resolvedBaseColorMode);
  const [baseColorModeState, setBaseColorModeState] = useState(() => initialModeState.baseColorMode);
  const [dimImagesInDarkModeState, setDimImagesInDarkModeState] = useState(() => getDimImagesInDarkMode());
  const [resolvedBaseColorModeState, setResolvedBaseColorModeState] = useState(() => initialModeState.resolvedBaseColorMode);
  const [pdfReadingModeState, setPdfReadingModeState] = useState(() => getPdfReadingMode());
  const [interfaceFontPresetState, setInterfaceFontPresetState] = useState(() => getInterfaceFontPreset());
  const [customInterfaceFontState, setCustomInterfaceFontState] = useState(() => getCustomInterfaceFont());
  const [monospaceFontPresetState, setMonospaceFontPresetState] = useState(() => getMonospaceFontPreset());
  const [customMonospaceFontState, setCustomMonospaceFontState] = useState(() => getCustomMonospaceFont());
  const [interfaceFontSizeState, setInterfaceFontSizeState] = useState(() => getInterfaceFontSize());
  const [workspaceDividerOpacityPercentState, setWorkspaceDividerOpacityPercentState] =
    useState(() => getWorkspaceDividerOpacityPercent());

  return {
    ...modeScoped,
    ...editorSettings,
    ...readingSettings,
    ...navigationTypography,
    baseColorModeState,
    dimImagesInDarkModeState,
    customInterfaceFontState,
    customMonospaceFontState,
    interfaceFontPresetState,
    interfaceFontSizeState,
    monospaceFontPresetState,
    pdfReadingModeState,
    resolvedBaseColorModeState,
    setBaseColorModeState,
    setDimImagesInDarkModeState,
    setCustomInterfaceFontState,
    setCustomMonospaceFontState,
    setInterfaceFontPresetState,
    setInterfaceFontSizeState,
    setMonospaceFontPresetState,
    setPdfReadingModeState,
    setResolvedBaseColorModeState,
    setWorkspaceDividerOpacityPercentState,
    workspaceDividerOpacityPercentState
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
  usePrePaintEffect(() => {
    const nextState = readModeScopedAppearanceState(state.resolvedBaseColorModeState);
    applyModeScopedAppearanceState(state, nextState);
  }, [state.resolvedBaseColorModeState]);
}

function useApplyAppearanceEffect(state: ReturnType<typeof useAppearanceStateValues>) {
  usePrePaintEffect(() => {
    const modeScopedState = readModeScopedAppearanceState(state.resolvedBaseColorModeState);
    applyAppearanceSettings({
      accentColor: modeScopedState.accentColorPreset,
      baseColor: state.baseColorModeState,
      resolvedBaseColor: state.resolvedBaseColorModeState,
      dimImagesInDarkMode: state.dimImagesInDarkModeState,
      pdfReadingMode: state.pdfReadingModeState,
      readingContentWidth: state.readingContentWidthState,
      readingLineHeight: state.readingLineHeightState,
      readingParagraphSpacing: state.readingParagraphSpacingState,
      clozeColor: modeScopedState.clozeColorPreset,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      fontColor: modeScopedState.fontColorPreset,
      highlightColor: modeScopedState.highlightColorPreset,
      selectionColor: modeScopedState.selectionColorPreset,
      interfaceFont: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      monospaceFont: state.monospaceFontPresetState,
      workspaceDividerOpacityPercent: state.workspaceDividerOpacityPercentState,
      workspaceSurfaceAssignments: modeScopedState.workspaceSurfaceAssignments,
      workspaceSurfacePalette: modeScopedState.workspaceSurfacePalette
    });
    applySelectionToolbarOpacityPercent(state.selectionToolbarOpacityPercentState);
  }, [
    state.accentColorPresetState,
    state.baseColorModeState,
    state.clozeColorPresetState,
    state.customInterfaceFontState,
    state.customMonospaceFontState,
    state.dimImagesInDarkModeState,
    state.fontColorPresetState,
    state.highlightColorPresetState,
    state.interfaceFontPresetState,
    state.interfaceFontSizeState,
    state.monospaceFontPresetState,
    state.pdfReadingModeState,
    state.readingContentWidthState,
    state.readingLineHeightState,
    state.readingParagraphSpacingState,
    state.selectionColorPresetState,
    state.selectionToolbarOpacityPercentState,
    state.resolvedBaseColorModeState,
    state.workspaceDividerOpacityPercentState,
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

export { useAppearanceSettings, useOptionalAppearanceSettings };

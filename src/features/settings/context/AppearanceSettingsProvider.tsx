import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getEditorDisplayMode,
  setEditorDisplayMode
} from '../../editor/model/editorDisplayMode';
import {
  getMarkdownSyntaxVisibility,
  setMarkdownSyntaxVisibility
} from '../../editor/model/markdownSyntaxSetting';
import {
  setAutoLocalizeRemoteImages,
  shouldAutoLocalizeRemoteImages as getAutoLocalizeRemoteImages
} from '../../editor/model/remoteImageLocalizationSetting';
import {
  applyAppearanceSettings,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
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
  INTERFACE_FONT_SIZE_DEFAULT,
  setAccentColorPreset,
  setBaseColorMode,
  setClozeColorPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setHighlightColorPreset,
  setSelectionColorPreset,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setUiFontPreset
} from '../model/appearanceSettings';

import {
  AppearanceSettingsContext,
  useAppearanceSettings
} from './appearanceSettingsContext';

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
    uiFontPresetState
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
      uiFont: state.uiFontPresetState
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
    state.uiFontPresetState
  ]);
}

function createAppearanceActions(state: ReturnType<typeof useAppearanceStateValues>) {
  return {
    resetAccentColorPreset: () => {
      setAccentColorPreset(DEFAULT_ACCENT_COLOR_PRESET);
      state.setAccentColorPresetState(DEFAULT_ACCENT_COLOR_PRESET);
    },
    resetInterfaceFontSize: () => {
      setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT);
      state.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT);
    },
    resetSelectionColorPreset: () => {
      setSelectionColorPreset(DEFAULT_SELECTION_COLOR_PRESET);
      state.setSelectionColorPresetState(DEFAULT_SELECTION_COLOR_PRESET);
    },
    resetHighlightColorPreset: () => {
      setHighlightColorPreset(DEFAULT_HIGHLIGHT_COLOR_PRESET);
      state.setHighlightColorPresetState(DEFAULT_HIGHLIGHT_COLOR_PRESET);
    },
    resetClozeColorPreset: () => {
      setClozeColorPreset(DEFAULT_CLOZE_COLOR_PRESET);
      state.setClozeColorPresetState(DEFAULT_CLOZE_COLOR_PRESET);
    },
    setAccentColorPreset: (value: typeof state.accentColorPresetState) => (setAccentColorPreset(value), state.setAccentColorPresetState(value)),
    setAutoLocalizeRemoteImages: (value: boolean) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: (value: typeof state.baseColorModeState) => (setBaseColorMode(value), state.setBaseColorModeState(value)),
    setClozeColorPreset: (value: typeof state.clozeColorPresetState) => (setClozeColorPreset(value), state.setClozeColorPresetState(value)),
    setCustomInterfaceFont: (value: string) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value: string) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setCustomUiFont: (value: string) => (setCustomUiFont(value), state.setCustomUiFontState(value)),
    setHighlightColorPreset: (value: typeof state.highlightColorPresetState) => (setHighlightColorPreset(value), state.setHighlightColorPresetState(value)),
    setSelectionColorPreset: (value: typeof state.selectionColorPresetState) => (setSelectionColorPreset(value), state.setSelectionColorPresetState(value)),
    setInterfaceFontPreset: (value: typeof state.interfaceFontPresetState) => (setInterfaceFontPreset(value), state.setInterfaceFontPresetState(value)),
    setInterfaceFontSize: (value: number) => (setInterfaceFontSize(value), state.setInterfaceFontSizeState(value)),
    setMarkdownSyntaxVisibility: (value: typeof state.markdownSyntaxVisibilityState) => (setMarkdownSyntaxVisibility(value), state.setMarkdownSyntaxVisibilityState(value)),
    setMonospaceFontPreset: (value: typeof state.monospaceFontPresetState) => (setMonospaceFontPreset(value), state.setMonospaceFontPresetState(value)),
    setUiFontPreset: (value: typeof state.uiFontPresetState) => (setUiFontPreset(value), state.setUiFontPresetState(value)),
    toggleEditorDisplayMode: () => {
      const next = state.editorDisplayModeState === 'preview' ? 'source' : 'preview';
      setEditorDisplayMode(next);
      state.setEditorDisplayModeState(next);
    }
  };
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
      state.uiFontPresetState
    ]
  );
}

export function AppearanceSettingsProvider({ children }: { children: ReactNode }) {
  const value = useAppearanceSettingsState();
  return <AppearanceSettingsContext.Provider value={value}>{children}</AppearanceSettingsContext.Provider>;
}

export { useAppearanceSettings };

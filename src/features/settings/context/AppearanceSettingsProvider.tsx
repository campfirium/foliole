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
  getAccentColorPreset,
  getBaseColorMode,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getMonospaceFontPreset,
  getUiFontPreset,
  INTERFACE_FONT_SIZE_DEFAULT,
  setAccentColorPreset,
  setBaseColorMode,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
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
    customInterfaceFontState,
    customMonospaceFontState,
    customUiFontState,
    editorDisplayModeState,
    interfaceFontPresetState,
    interfaceFontSizeState,
    markdownSyntaxVisibilityState,
    monospaceFontPresetState,
    setAccentColorPresetState,
    setAutoLocalizeRemoteImagesState,
    setBaseColorModeState,
    setCustomInterfaceFontState,
    setCustomMonospaceFontState,
    setCustomUiFontState,
    setEditorDisplayModeState,
    setInterfaceFontPresetState,
    setInterfaceFontSizeState,
    setMarkdownSyntaxVisibilityState,
    setMonospaceFontPresetState,
    setUiFontPresetState,
    uiFontPresetState
  };
}

function useAppearanceSideEffects(state: ReturnType<typeof useAppearanceStateValues>) {
  useEffect(() => {
    applyAppearanceSettings({
      accentColor: state.accentColorPresetState,
      baseColor: state.baseColorModeState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      interfaceFont: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      monospaceFont: state.monospaceFontPresetState,
      uiFont: state.uiFontPresetState
    });
  }, [
    state.accentColorPresetState,
    state.baseColorModeState,
    state.customInterfaceFontState,
    state.customMonospaceFontState,
    state.customUiFontState,
    state.interfaceFontPresetState,
    state.interfaceFontSizeState,
    state.monospaceFontPresetState,
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
    setAccentColorPreset: (value: typeof state.accentColorPresetState) => (setAccentColorPreset(value), state.setAccentColorPresetState(value)),
    setAutoLocalizeRemoteImages: (value: boolean) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: (value: typeof state.baseColorModeState) => (setBaseColorMode(value), state.setBaseColorModeState(value)),
    setCustomInterfaceFont: (value: string) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value: string) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setCustomUiFont: (value: string) => (setCustomUiFont(value), state.setCustomUiFontState(value)),
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
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      editorAppearanceKey: `${state.markdownSyntaxVisibilityState}-${state.editorDisplayModeState}`,
      editorDisplayMode: state.editorDisplayModeState,
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
      state.customInterfaceFontState,
      state.customMonospaceFontState,
      state.customUiFontState,
      state.editorDisplayModeState,
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

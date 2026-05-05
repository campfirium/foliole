import { createContext, useContext } from 'react';

import type { EditorDisplayMode } from '../../editor/model/editorDisplayMode';
import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import type {
  AccentColorPreset,
  BaseColorMode,
  ClozeColorPreset,
  HighlightColorPreset,
  InterfaceFontPreset,
  SelectionColorPreset,
  MonospaceFontPreset
} from '../model/appearanceSettings';

export interface AppearanceSettingsContextValue {
  accentColorPreset: AccentColorPreset;
  autoLocalizeRemoteImages: boolean;
  baseColorMode: BaseColorMode;
  customInterfaceFont: string;
  customMonospaceFont: string;
  customUiFont: string;
  editorAppearanceKey: string;
  editorDisplayMode: EditorDisplayMode;
  clozeColorPreset: ClozeColorPreset;
  selectionColorPreset: SelectionColorPreset;
  highlightColorPreset: HighlightColorPreset;
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontPreset: MonospaceFontPreset;
  uiFontPreset: InterfaceFontPreset;
  resetAccentColorPreset: () => void;
  resetClozeColorPreset: () => void;
  resetSelectionColorPreset: () => void;
  resetHighlightColorPreset: () => void;
  resetInterfaceFontSize: () => void;
  setAccentColorPreset: (value: AccentColorPreset) => void;
  setAutoLocalizeRemoteImages: (value: boolean) => void;
  setBaseColorMode: (value: BaseColorMode) => void;
  setClozeColorPreset: (value: ClozeColorPreset) => void;
  setHighlightColorPreset: (value: HighlightColorPreset) => void;
  setSelectionColorPreset: (value: SelectionColorPreset) => void;
  setCustomInterfaceFont: (value: string) => void;
  setCustomMonospaceFont: (value: string) => void;
  setCustomUiFont: (value: string) => void;
  setInterfaceFontPreset: (value: InterfaceFontPreset) => void;
  setInterfaceFontSize: (value: number) => void;
  setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => void;
  setMonospaceFontPreset: (value: MonospaceFontPreset) => void;
  setUiFontPreset: (value: InterfaceFontPreset) => void;
  toggleEditorDisplayMode: () => void;
}

export const AppearanceSettingsContext = createContext<AppearanceSettingsContextValue | null>(null);

export function useAppearanceSettings() {
  const context = useContext(AppearanceSettingsContext);
  if (!context) {
    throw new Error('AppearanceSettingsProvider is missing.');
  }
  return context;
}

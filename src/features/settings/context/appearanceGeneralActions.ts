import { setEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { type FrontmatterDisplayMode, setFrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import { resetFrontmatterMetaFields, setFrontmatterMetaFields } from '../../editor/model/frontmatterMetaFieldsSetting';
import { type MarkdownSyntaxVisibility, setMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { setAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
import {
  INTERFACE_FONT_SIZE_DEFAULT,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  setBaseColorMode,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setDimImagesInDarkMode,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setPdfReadingMode,
  setReadingContentWidth,
  setReadingLineHeight,
  setUiFontPreset
} from '../model/appearanceSettings';
import type { BaseColorMode } from '../model/baseColorMode';

import type { AppearanceState } from './appearanceSettingsActions';
import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';

export type GeneralAppearanceActions = Pick<
  AppearanceSettingsContextValue,
  | 'resetInterfaceFontSize'
  | 'resetFrontmatterMetaFields'
  | 'setAutoLocalizeRemoteImages'
  | 'setBaseColorMode'
  | 'setCustomInterfaceFont'
  | 'setCustomMonospaceFont'
  | 'setCustomUiFont'
  | 'setDimImagesInDarkMode'
  | 'setFrontmatterDisplayMode'
  | 'setFrontmatterMetaFields'
  | 'setInterfaceFontPreset'
  | 'setInterfaceFontSize'
  | 'setMarkdownSyntaxVisibility'
  | 'setMonospaceFontPreset'
  | 'setPdfReadingMode'
  | 'setReadingContentWidth'
  | 'setReadingLineHeight'
  | 'setUiFontPreset'
  | 'toggleBaseColorMode'
  | 'toggleEditorDisplayMode'
>;

export function createGeneralAppearanceActions(state: AppearanceState): GeneralAppearanceActions {
  return {
    resetInterfaceFontSize: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), state.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    resetFrontmatterMetaFields: () => state.setFrontmatterMetaFieldsState(resetFrontmatterMetaFields()),
    setAutoLocalizeRemoteImages: (value: boolean) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: (value: BaseColorMode) => (setBaseColorMode(value), state.setBaseColorModeState(value)),
    setCustomInterfaceFont: (value: string) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value: string) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setCustomUiFont: (value: string) => (setCustomUiFont(value), state.setCustomUiFontState(value)),
    setDimImagesInDarkMode: (value: boolean) => (setDimImagesInDarkMode(value), state.setDimImagesInDarkModeState(value)),
    setFrontmatterDisplayMode: (value: FrontmatterDisplayMode) => (setFrontmatterDisplayMode(value), state.setFrontmatterDisplayModeState(value)),
    setFrontmatterMetaFields: (value: string) => state.setFrontmatterMetaFieldsState(setFrontmatterMetaFields(value)),
    setInterfaceFontPreset: (value: InterfaceFontPreset) => (setInterfaceFontPreset(value), state.setInterfaceFontPresetState(value)),
    setInterfaceFontSize: (value: number) => (setInterfaceFontSize(value), state.setInterfaceFontSizeState(value)),
    setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => (setMarkdownSyntaxVisibility(value), state.setMarkdownSyntaxVisibilityState(value)),
    setMonospaceFontPreset: (value: MonospaceFontPreset) => (setMonospaceFontPreset(value), state.setMonospaceFontPresetState(value)),
    setPdfReadingMode: (value: PdfReadingMode) => (setPdfReadingMode(value), state.setPdfReadingModeState(value)),
    setReadingContentWidth: (value: number) => (setReadingContentWidth(value), state.setReadingContentWidthState(value)),
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

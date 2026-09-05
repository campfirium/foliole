import { setEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { type FrontmatterDisplayMode, setFrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import { resetFrontmatterMetaFields, setFrontmatterMetaFields } from '../../editor/model/frontmatterMetaFieldsSetting';
import { type MarkdownSyntaxVisibility, setMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { setAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
import { setSelectionToolbarEnabled, setSelectionToolbarOpacityPercent } from '../../editor/model/selectionToolbarSettings';
import {
  INTERFACE_FONT_SIZE_DEFAULT,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  type ReadingParagraphSpacing,
  setBaseColorMode,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setDimImagesInDarkMode,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setImmersiveDoubleClickEditEnabled,
  setMonospaceFontPreset,
  setPdfReadingMode,
  setReadingContentWidth,
  setReadingLineHeight,
  setReadingParagraphSpacing,
} from '../model/appearanceSettings';
import type { BaseColorMode } from '../model/baseColorMode';
import { resolveBaseColorMode } from '../model/baseColorMode';

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
  | 'setDimImagesInDarkMode'
  | 'setFrontmatterDisplayMode'
  | 'setFrontmatterMetaFields'
  | 'setInterfaceFontPreset'
  | 'setInterfaceFontSize'
  | 'setImmersiveDoubleClickEditEnabled'
  | 'setMarkdownSyntaxVisibility'
  | 'setSelectionToolbarEnabled'
  | 'setSelectionToolbarOpacityPercent'
  | 'setMonospaceFontPreset'
  | 'setPdfReadingMode'
  | 'setReadingContentWidth'
  | 'setReadingLineHeight'
  | 'setReadingParagraphSpacing'
  | 'toggleBaseColorMode'
  | 'toggleEditorDisplayMode'
>;

export function createGeneralAppearanceActions(state: AppearanceState): GeneralAppearanceActions {
  const applyBaseColorMode = (value: BaseColorMode) => {
    setBaseColorMode(value);
    state.setBaseColorModeState(value);
    state.setResolvedBaseColorModeState(resolveBaseColorMode(value));
  };

  return {
    resetInterfaceFontSize: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), state.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    resetFrontmatterMetaFields: () => state.setFrontmatterMetaFieldsState(resetFrontmatterMetaFields()),
    setAutoLocalizeRemoteImages: (value: boolean) => (setAutoLocalizeRemoteImages(value), state.setAutoLocalizeRemoteImagesState(value)),
    setBaseColorMode: applyBaseColorMode,
    setCustomInterfaceFont: (value: string) => (setCustomInterfaceFont(value), state.setCustomInterfaceFontState(value)),
    setCustomMonospaceFont: (value: string) => (setCustomMonospaceFont(value), state.setCustomMonospaceFontState(value)),
    setDimImagesInDarkMode: (value: boolean) => (setDimImagesInDarkMode(value), state.setDimImagesInDarkModeState(value)),
    setFrontmatterDisplayMode: (value: FrontmatterDisplayMode) => (setFrontmatterDisplayMode(value), state.setFrontmatterDisplayModeState(value)),
    setFrontmatterMetaFields: (value: string) => state.setFrontmatterMetaFieldsState(setFrontmatterMetaFields(value)),
    setInterfaceFontPreset: (value: InterfaceFontPreset) => (setInterfaceFontPreset(value), state.setInterfaceFontPresetState(value)),
    setInterfaceFontSize: (value: number) => (setInterfaceFontSize(value), state.setInterfaceFontSizeState(value)),
    setImmersiveDoubleClickEditEnabled: (value: boolean) => (
      setImmersiveDoubleClickEditEnabled(value),
      state.setImmersiveDoubleClickEditEnabledState(value)
    ),
    setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => (setMarkdownSyntaxVisibility(value), state.setMarkdownSyntaxVisibilityState(value)),
    setSelectionToolbarEnabled: (value: boolean) => (setSelectionToolbarEnabled(value), state.setSelectionToolbarEnabledState(value)),
    setSelectionToolbarOpacityPercent: (value: number) => state.setSelectionToolbarOpacityPercentState(setSelectionToolbarOpacityPercent(value)),
    setMonospaceFontPreset: (value: MonospaceFontPreset) => (setMonospaceFontPreset(value), state.setMonospaceFontPresetState(value)),
    setPdfReadingMode: (value: PdfReadingMode) => (setPdfReadingMode(value), state.setPdfReadingModeState(value)),
    setReadingContentWidth: (value: number) => (setReadingContentWidth(value), state.setReadingContentWidthState(value)),
    setReadingLineHeight: (value: ReadingLineHeight) => state.setReadingLineHeightState(setReadingLineHeight(value)),
    setReadingParagraphSpacing: (value: ReadingParagraphSpacing) => state.setReadingParagraphSpacingState(setReadingParagraphSpacing(value)),
    toggleBaseColorMode: () => {
      applyBaseColorMode(state.advanceBaseColorModeCycle(state.resolvedBaseColorModeState));
    },
    toggleEditorDisplayMode: () => {
      const next = state.editorDisplayModeState === 'preview' ? 'source' : 'preview';
      state.setEditorDisplayModeState(next);
      return setEditorDisplayMode(next);
    }
  };
}

import { useMemo } from 'react';

import { createAppearanceActions } from './appearanceSettingsActions';
import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';
import type { useAppearanceStateValues } from './AppearanceSettingsProvider';

type AppearanceStateValues = ReturnType<typeof useAppearanceStateValues>;

function createSelectionToolbarSettingsValue(state: AppearanceStateValues) {
  return {
    selectionToolbarEnabled: state.selectionToolbarEnabledState,
    selectionToolbarOpacityPercent: state.selectionToolbarOpacityPercentState
  };
}

function createReadingSettingsValue(state: AppearanceStateValues) {
  return {
    readingContentWidth: state.readingContentWidthState,
    readingLineHeight: state.readingLineHeightState,
    readingParagraphSpacing: state.readingParagraphSpacingState
  };
}

function createWorkspaceSettingsValue(state: AppearanceStateValues) {
  return {
    workspaceDividerOpacityPercent: state.workspaceDividerOpacityPercentState,
    workspaceSurfaceAssignments: state.workspaceSurfaceAssignmentsState,
    workspaceSurfacePalette: state.workspaceSurfacePaletteState
  };
}

export function useAppearanceSettingsValue(state: AppearanceStateValues): AppearanceSettingsContextValue {
  return useMemo(
    () => ({
      accentColorPreset: state.accentColorPresetState,
      autoLocalizeRemoteImages: state.autoLocalizeRemoteImagesState,
      baseColorMode: state.baseColorModeState,
      dimImagesInDarkMode: state.dimImagesInDarkModeState,
      resolvedBaseColorMode: state.resolvedBaseColorModeState,
      clozeColorPreset: state.clozeColorPresetState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
      customUiFont: state.customUiFontState,
      editorAppearanceKey: `${state.markdownSyntaxVisibilityState}-${state.frontmatterMetaFieldsState}-${state.editorDisplayModeState}`,
      editorDisplayMode: state.editorDisplayModeState,
      fontColorPreset: state.fontColorPresetState,
      frontmatterDisplayMode: state.frontmatterDisplayModeState,
      frontmatterMetaFields: state.frontmatterMetaFieldsState,
      highlightColorPreset: state.highlightColorPresetState,
      selectionColorPreset: state.selectionColorPresetState,
      ...createSelectionToolbarSettingsValue(state),
      interfaceFontPreset: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      markdownSyntaxVisibility: state.markdownSyntaxVisibilityState,
      monospaceFontPreset: state.monospaceFontPresetState,
      pdfReadingMode: state.pdfReadingModeState,
      ...createReadingSettingsValue(state),
      uiFontPreset: state.uiFontPresetState,
      ...createWorkspaceSettingsValue(state),
      ...createAppearanceActions(state)
    }),
    [
      state.accentColorPresetState,
      state.autoLocalizeRemoteImagesState,
      state.baseColorModeState,
      state.dimImagesInDarkModeState,
      state.clozeColorPresetState,
      state.customInterfaceFontState,
      state.customMonospaceFontState,
      state.customUiFontState,
      state.editorDisplayModeState,
      state.fontColorPresetState,
      state.frontmatterDisplayModeState,
      state.frontmatterMetaFieldsState,
      state.highlightColorPresetState,
      state.selectionColorPresetState, state.selectionToolbarEnabledState,
      state.selectionToolbarOpacityPercentState, state.resolvedBaseColorModeState,
      state.interfaceFontPresetState,
      state.interfaceFontSizeState,
      state.markdownSyntaxVisibilityState,
      state.monospaceFontPresetState,
      state.pdfReadingModeState,
      state.readingContentWidthState,
      state.readingLineHeightState,
      state.readingParagraphSpacingState,
      state.uiFontPresetState,
      state.workspaceDividerOpacityPercentState,
      state.workspaceSurfaceAssignmentsState,
      state.workspaceSurfacePaletteState
    ]);
}

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
    immersiveDoubleClickEditEnabled: state.immersiveDoubleClickEditEnabledState,
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

function createNavigationTypographyValue(state: AppearanceStateValues) {
  return {
    nodeListRowSpacing: state.nodeListRowSpacingState,
    resetNodeListRowSpacing: state.resetNodeListRowSpacing,
    setNodeListRowSpacing: state.setNodeListRowSpacing
  };
}

function createAppearanceSettingsContextValue(state: AppearanceStateValues): AppearanceSettingsContextValue {
  return {
      accentColorPreset: state.accentColorPresetState,
      autoLocalizeRemoteImages: state.autoLocalizeRemoteImagesState,
      baseColorMode: state.baseColorModeState,
      dimImagesInDarkMode: state.dimImagesInDarkModeState,
      resolvedBaseColorMode: state.resolvedBaseColorModeState,
      clozeColorPreset: state.clozeColorPresetState,
      customInterfaceFont: state.customInterfaceFontState,
      customMonospaceFont: state.customMonospaceFontState,
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
      isBaseColorModeSelectionActive: state.isBaseColorModeSelectionActiveState,
      markdownSyntaxVisibility: state.markdownSyntaxVisibilityState,
      monospaceFontPreset: state.monospaceFontPresetState,
      ...createNavigationTypographyValue(state),
      pdfReadingMode: state.pdfReadingModeState,
      ...createReadingSettingsValue(state),
      ...createWorkspaceSettingsValue(state),
      ...createAppearanceActions(state)
    };
}

export function useAppearanceSettingsValue(state: AppearanceStateValues): AppearanceSettingsContextValue {
  return useMemo(
    () => createAppearanceSettingsContextValue(state),
    [
      state.accentColorPresetState,
      state.autoLocalizeRemoteImagesState,
      state.baseColorModeState,
      state.dimImagesInDarkModeState,
      state.clozeColorPresetState,
      state.customInterfaceFontState,
      state.customMonospaceFontState,
      state.editorDisplayModeState,
      state.fontColorPresetState,
      state.frontmatterDisplayModeState,
      state.frontmatterMetaFieldsState,
      state.highlightColorPresetState,
      state.selectionColorPresetState, state.selectionToolbarEnabledState,
      state.selectionToolbarOpacityPercentState, state.resolvedBaseColorModeState,
      state.interfaceFontPresetState,
      state.interfaceFontSizeState,
      state.immersiveDoubleClickEditEnabledState,
      state.isBaseColorModeSelectionActiveState,
      state.markdownSyntaxVisibilityState,
      state.monospaceFontPresetState,
      state.nodeListRowSpacingState,
      state.pdfReadingModeState,
      state.readingContentWidthState,
      state.readingLineHeightState,
      state.readingParagraphSpacingState,
      state.workspaceDividerOpacityPercentState,
      state.workspaceSurfaceAssignmentsState,
      state.workspaceSurfacePaletteState
    ]);
}

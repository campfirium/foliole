import { useMemo } from 'react';

import { createAppearanceActions } from './appearanceSettingsActions';
import type { AppearanceSettingsContextValue } from './appearanceSettingsContext';
import type { useAppearanceStateValues } from './AppearanceSettingsProvider';

type AppearanceStateValues = ReturnType<typeof useAppearanceStateValues>;

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
      editorAppearanceKey: `${state.markdownSyntaxVisibilityState}-${state.editorDisplayModeState}`,
      editorDisplayMode: state.editorDisplayModeState,
      fontColorPreset: state.fontColorPresetState,
      highlightColorPreset: state.highlightColorPresetState,
      selectionColorPreset: state.selectionColorPresetState,
      interfaceFontPreset: state.interfaceFontPresetState,
      interfaceFontSize: state.interfaceFontSizeState,
      markdownSyntaxVisibility: state.markdownSyntaxVisibilityState,
      monospaceFontPreset: state.monospaceFontPresetState,
      pdfReadingMode: state.pdfReadingModeState,
      readingLineHeight: state.readingLineHeightState,
      uiFontPreset: state.uiFontPresetState,
      workspaceSurfaceAssignments: state.workspaceSurfaceAssignmentsState,
      workspaceSurfacePalette: state.workspaceSurfacePaletteState,
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
      state.highlightColorPresetState,
      state.selectionColorPresetState,
      state.resolvedBaseColorModeState,
      state.interfaceFontPresetState,
      state.interfaceFontSizeState,
      state.markdownSyntaxVisibilityState,
      state.monospaceFontPresetState,
      state.pdfReadingModeState,
      state.readingLineHeightState,
      state.uiFontPresetState,
      state.workspaceSurfaceAssignmentsState,
      state.workspaceSurfacePaletteState
    ]
  );
}

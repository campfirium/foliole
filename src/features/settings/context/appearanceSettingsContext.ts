import { createContext, useContext } from 'react';

import type { EditorDisplayMode } from '../../editor/model/editorDisplayMode';
import type { FrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import type {
  AccentColorPreset,
  ClozeColorPreset,
  FontColorPreset,
  HighlightColorPreset,
  InterfaceFontPreset,
  PdfReadingMode,
  ReadingLineHeight,
  ReadingParagraphSpacing,
  SelectionColorPreset,
  MonospaceFontPreset,
  WorkspaceSurfaceAssignments,
  WorkspaceSurfacePalette
} from '../model/appearanceSettings';
import type { BaseColorMode, ResolvedBaseColorMode } from '../model/baseColorMode';

export interface AppearanceSettingsContextValue {
  accentColorPreset: AccentColorPreset;
  autoLocalizeRemoteImages: boolean;
  baseColorMode: BaseColorMode;
  dimImagesInDarkMode: boolean;
  resolvedBaseColorMode: ResolvedBaseColorMode;
  customInterfaceFont: string;
  customMonospaceFont: string;
  customUiFont: string;
  editorAppearanceKey: string;
  editorDisplayMode: EditorDisplayMode;
  clozeColorPreset: ClozeColorPreset;
  pdfReadingMode: PdfReadingMode;
  readingContentWidth: number;
  readingLineHeight: ReadingLineHeight;
  readingParagraphSpacing: ReadingParagraphSpacing;
  fontColorPreset: FontColorPreset;
  frontmatterDisplayMode: FrontmatterDisplayMode;
  frontmatterMetaFields: string;
  selectionColorPreset: SelectionColorPreset;
  selectionToolbarEnabled: boolean;
  selectionToolbarOpacityPercent: number;
  highlightColorPreset: HighlightColorPreset;
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontPreset: MonospaceFontPreset;
  uiFontPreset: InterfaceFontPreset;
  workspaceSurfaceAssignments: WorkspaceSurfaceAssignments;
  workspaceSurfacePalette: WorkspaceSurfacePalette;
  resetAccentColorPreset: () => void;
  resetClozeColorPreset: () => void;
  resetFontColorPreset: () => void;
  resetSelectionColorPreset: () => void;
  resetHighlightColorPreset: () => void;
  resetInterfaceFontSize: () => void;
  resetWorkspaceSurfaceSettings: () => void;
  setAccentColorPreset: (value: AccentColorPreset) => void;
  setAutoLocalizeRemoteImages: (value: boolean) => void;
  setBaseColorMode: (value: BaseColorMode) => void;
  setClozeColorPreset: (value: ClozeColorPreset) => void;
  setDimImagesInDarkMode: (value: boolean) => void;
  setFontColorPreset: (value: FontColorPreset) => void;
  setFrontmatterDisplayMode: (value: FrontmatterDisplayMode) => void;
  setFrontmatterMetaFields: (value: string) => void;
  resetFrontmatterMetaFields: () => void;
  setHighlightColorPreset: (value: HighlightColorPreset) => void;
  setSelectionColorPreset: (value: SelectionColorPreset) => void;
  setCustomInterfaceFont: (value: string) => void;
  setCustomMonospaceFont: (value: string) => void;
  setCustomUiFont: (value: string) => void;
  setInterfaceFontPreset: (value: InterfaceFontPreset) => void;
  setInterfaceFontSize: (value: number) => void;
  setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => void;
  setSelectionToolbarEnabled: (value: boolean) => void;
  setSelectionToolbarOpacityPercent: (value: number) => void;
  setMonospaceFontPreset: (value: MonospaceFontPreset) => void;
  setPdfReadingMode: (value: PdfReadingMode) => void;
  setReadingContentWidth: (value: number) => void;
  setReadingLineHeight: (value: ReadingLineHeight) => void;
  setReadingParagraphSpacing: (value: ReadingParagraphSpacing) => void;
  setUiFontPreset: (value: InterfaceFontPreset) => void;
  setWorkspaceSurfaceAssignments: (value: WorkspaceSurfaceAssignments) => void;
  setWorkspaceSurfacePalette: (value: WorkspaceSurfacePalette) => void;
  toggleBaseColorMode: () => void;
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

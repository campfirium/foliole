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
  immersiveDoubleClickEditEnabled: boolean;
  isBaseColorModeSelectionActive: boolean;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontPreset: MonospaceFontPreset;
  nodeListRowSpacing: number;
  workspaceDividerOpacityPercent: number;
  workspaceSurfaceAssignments: WorkspaceSurfaceAssignments;
  workspaceSurfacePalette: WorkspaceSurfacePalette;
  resetAccentColorPreset: () => void;
  resetClozeColorPreset: () => void;
  resetFontColorPreset: () => void;
  resetSelectionColorPreset: () => void;
  resetHighlightColorPreset: () => void;
  resetInterfaceFontSize: () => void;
  resetNodeListRowSpacing: () => void;
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
  setInterfaceFontPreset: (value: InterfaceFontPreset) => void;
  setInterfaceFontSize: (value: number) => void;
  setImmersiveDoubleClickEditEnabled: (value: boolean) => void;
  setMarkdownSyntaxVisibility: (value: MarkdownSyntaxVisibility) => void;
  setSelectionToolbarEnabled: (value: boolean) => void;
  setSelectionToolbarOpacityPercent: (value: number) => void;
  setMonospaceFontPreset: (value: MonospaceFontPreset) => void;
  setNodeListRowSpacing: (value: number) => void;
  setPdfReadingMode: (value: PdfReadingMode) => void;
  setReadingContentWidth: (value: number) => void;
  setReadingLineHeight: (value: ReadingLineHeight) => void;
  setReadingParagraphSpacing: (value: ReadingParagraphSpacing) => void;
  setWorkspaceDividerOpacityPercent: (value: number) => void;
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

export function useOptionalAppearanceSettings() {
  return useContext(AppearanceSettingsContext);
}

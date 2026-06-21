import {
  applyAppearanceColorSettings,
  type AccentColorPreset,
  type ClozeColorPreset,
  type FontColorPreset,
  type HighlightColorPreset,
  type SelectionColorPreset
} from './appearanceColorSettings';
import { clampFontSize, sanitizeFontFamily } from './appearanceFontSettings';
import { resolvePdfReadingModeForColorMode } from './appearanceReadingModeSettings';
import {
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight,
  type ReadingParagraphSpacing
} from './appearanceSettingsOptions';
import {
  applyEditorTypographyScale,
  applyReadingLineHeight,
  applyReadingParagraphSpacing,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveUiFontFamily
} from './appearanceTypography';
import type { BaseColorMode, ResolvedBaseColorMode } from './baseColorMode';
import { applyWorkspaceDividerOpacityPercent } from './workspaceDividerSettings';
import {
  applyWorkspaceSurfaceSettings,
  type WorkspaceSurfaceAssignments,
  type WorkspaceSurfacePalette
} from './workspaceSurfaceSettings';

interface ApplyAppearanceSettingsInput {
  accentColor: AccentColorPreset;
  baseColor: BaseColorMode;
  clozeColor: ClozeColorPreset;
  customUiFont: string;
  customInterfaceFont: string;
  customMonospaceFont: string;
  dimImagesInDarkMode: boolean;
  fontColor: FontColorPreset;
  highlightColor: HighlightColorPreset;
  interfaceFont: InterfaceFontPreset;
  interfaceFontSize: number;
  monospaceFont: MonospaceFontPreset;
  pdfReadingMode: PdfReadingMode;
  readingContentWidth: number;
  readingLineHeight: ReadingLineHeight;
  readingParagraphSpacing: ReadingParagraphSpacing;
  resolvedBaseColor: ResolvedBaseColorMode;
  selectionColor: SelectionColorPreset;
  uiFont: InterfaceFontPreset;
  workspaceDividerOpacityPercent: number;
  workspaceSurfaceAssignments: WorkspaceSurfaceAssignments;
  workspaceSurfacePalette: WorkspaceSurfacePalette;
}

const BASE_APPEARANCE_TOKENS_BY_MODE = {
  dark: {
    '--color-background': '17 20 19',
    '--color-bg-panel': '26 31 30',
    '--color-canvas': '22 25 24',
    '--workspace-divider-mix-target': 'white',
    '--workspace-divider-subtle-surface-weight': '93%'
  },
  light: {
    '--color-background': '245 245 243',
    '--color-bg-panel': '246 246 246',
    '--color-canvas': '255 255 255',
    '--workspace-divider-mix-target': 'black',
    '--workspace-divider-subtle-surface-weight': '92%'
  }
} as const;

function applyBaseAppearanceTokens(root: HTMLElement, mode: ResolvedBaseColorMode) {
  Object.entries(BASE_APPEARANCE_TOKENS_BY_MODE[mode]).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
}

export function applyAppearanceSettings(settings: ApplyAppearanceSettingsInput) {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  const clampedFontSize = clampFontSize(settings.interfaceFontSize);
  root.dataset.baseColor = settings.baseColor;
  root.dataset.dimImagesInDarkMode = settings.dimImagesInDarkMode ? 'true' : 'false';
  root.dataset.resolvedBaseColor = settings.resolvedBaseColor;
  root.dataset.pdfReadingMode = resolvePdfReadingModeForColorMode(settings.pdfReadingMode, settings.resolvedBaseColor);
  applyBaseAppearanceTokens(root, settings.resolvedBaseColor);
  applyAppearanceColorSettings(root, {
    accentColor: settings.accentColor,
    clozeColor: settings.clozeColor,
    fontColor: settings.fontColor,
    highlightColor: settings.highlightColor,
    mode: settings.resolvedBaseColor,
    selectionColor: settings.selectionColor
  });
  applyWorkspaceSurfaceSettings(root, {
    assignments: settings.workspaceSurfaceAssignments,
    palette: settings.workspaceSurfacePalette
  });
  applyWorkspaceDividerOpacityPercent(root, settings.workspaceDividerOpacityPercent);
  root.style.setProperty('--app-interface-font-family', resolveUiFontFamily());
  root.style.setProperty('--content-panel-font-family', resolveInterfaceFontFamily(settings.interfaceFont, sanitizeFontFamily(settings.customInterfaceFont)));
  root.style.setProperty('--content-panel-mono-font-family', resolveMonospaceFontFamily(settings.monospaceFont, sanitizeFontFamily(settings.customMonospaceFont)));
  root.style.setProperty('--document-max-width', `${settings.readingContentWidth}px`);
  applyEditorTypographyScale(root, clampedFontSize);
  applyReadingLineHeight(root, settings.readingLineHeight);
  applyReadingParagraphSpacing(root, settings.readingParagraphSpacing);
}

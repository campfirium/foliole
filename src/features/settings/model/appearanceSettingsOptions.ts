export const INTERFACE_FONT_OPTIONS = ['default', 'system', 'serif', 'custom'] as const;
export const MONOSPACE_FONT_OPTIONS = ['default', 'jetbrains', 'cascadia', 'consolas', 'fira', 'sarasa', 'custom'] as const;
export const PDF_READING_MODE_OPTIONS = ['original', 'inverted', 'warm'] as const;

export type InterfaceFontPreset = (typeof INTERFACE_FONT_OPTIONS)[number];
export type MonospaceFontPreset = (typeof MONOSPACE_FONT_OPTIONS)[number];
export type PdfReadingMode = (typeof PDF_READING_MODE_OPTIONS)[number];
export type ReadingLineHeight = number;
export type ReadingParagraphSpacing = number;

export const INTERFACE_FONT_SIZE_MIN = 12;
export const INTERFACE_FONT_SIZE_MAX = 36;
export const INTERFACE_FONT_SIZE_DEFAULT = 17;
export const READING_LINE_HEIGHT_MIN = 1.3;
export const READING_LINE_HEIGHT_MAX = 2;
export const READING_LINE_HEIGHT_STEP = 0.05;
export const READING_PARAGRAPH_SPACING_MIN = 0;
export const READING_PARAGRAPH_SPACING_MAX = 1.5;
export const READING_PARAGRAPH_SPACING_STEP = 0.05;
export const DEFAULT_PDF_READING_MODE: PdfReadingMode = 'inverted';
export const DEFAULT_READING_LINE_HEIGHT: ReadingLineHeight = 1.65;
export const DEFAULT_READING_PARAGRAPH_SPACING: ReadingParagraphSpacing = 0.75;
export const DEFAULT_DIM_IMAGES_IN_DARK_MODE = false;

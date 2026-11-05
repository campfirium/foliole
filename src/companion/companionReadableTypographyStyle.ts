import type { CSSProperties } from 'react';

import { readingFontCssFamily } from './companionReadingFonts';
import { companionMonospaceFontFamily } from './companionReadingMonospace';
import { readingFontSize, readingLineHeight, readingParagraphSpacing, readingTextWidth, type CompanionReadingTypographySettings } from './companionReadingTypographySettings';

export function readingFontFamily(value: CompanionReadingTypographySettings['fontFamily']) {
  if (value === 'serif') return 'Georgia, "Times New Roman", serif';
  if (value === 'sans') return 'var(--font-family-sans)';
  if (value.startsWith('system:')) return `"${value.slice(7)}", var(--font-family-sans)`;
  return `"${readingFontCssFamily(value.slice(7))}", var(--font-family-sans)`;
}

export function typographyStyle(settings: CompanionReadingTypographySettings): CSSProperties {
  return {
    '--content-panel-font-family': readingFontFamily(settings.fontFamily),
    '--content-panel-mono-font-family': companionMonospaceFontFamily(settings.monospaceFont),
    '--content-panel-font-weight': String(settings.fontWeight),
    '--content-panel-font-size': `${readingFontSize(settings.fontSize)}px`,
    '--content-panel-line-height': String(readingLineHeight(settings.lineHeight)),
    '--content-panel-paragraph-spacing': `${readingParagraphSpacing(settings.paragraphSpacing)}em`,
    '--document-content-inline-padding': '0px',
    '--document-max-width': `${readingTextWidth(settings.textWidth)}%`,
    '--content-panel-text-color': settings.contrast === 'high'
      ? 'var(--role-text)'
      : 'color-mix(in srgb, var(--role-text) 92%, var(--role-text-secondary))'
  } as CSSProperties;
}

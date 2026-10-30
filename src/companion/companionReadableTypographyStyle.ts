import type { CSSProperties } from 'react';

import { readingFontCssFamily } from './companionReadingFonts';
import { readingFontSize, readingLineHeight, type CompanionReadingTypographySettings } from './companionReadingTypographySettings';

const PARAGRAPH_SPACING = '0.35em';

function readingFontFamily(value: CompanionReadingTypographySettings['fontFamily']) {
  if (value === 'serif') return 'Georgia, "Times New Roman", serif';
  if (value === 'sans') return 'var(--font-family-sans)';
  if (value.startsWith('system:')) return `"${value.slice(7)}", var(--font-family-sans)`;
  return `"${readingFontCssFamily(value.slice(7))}", var(--font-family-sans)`;
}

export function typographyStyle(settings: CompanionReadingTypographySettings): CSSProperties {
  return {
    '--content-panel-font-family': readingFontFamily(settings.fontFamily),
    '--content-panel-font-size': `${readingFontSize(settings.fontSize)}px`,
    '--content-panel-line-height': String(readingLineHeight(settings.lineHeight)),
    '--content-panel-paragraph-spacing': PARAGRAPH_SPACING,
    '--document-content-inline-padding': '0px',
    '--content-panel-text-color': settings.contrast === 'high'
      ? 'var(--color-text-primary)'
      : 'color-mix(in srgb, var(--color-text-primary) 92%, var(--color-text-secondary))'
  } as CSSProperties;
}

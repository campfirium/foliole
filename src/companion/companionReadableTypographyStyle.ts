import type { CSSProperties } from 'react';

import { readingFontCssFamily } from './companionReadingFonts';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

const FONT_SIZE_VALUES: Record<CompanionReadingTypographySettings['fontSize'], string> = {
  default: '1.0625rem',
  large: '1.1875rem',
  small: '0.9375rem',
  xlarge: '1.3125rem'
};

const LINE_HEIGHT_VALUES: Record<CompanionReadingTypographySettings['lineHeight'], string> = {
  compact: '1.45',
  default: '1.62',
  relaxed: '1.78'
};

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
    '--content-panel-font-size': FONT_SIZE_VALUES[settings.fontSize],
    '--content-panel-line-height': LINE_HEIGHT_VALUES[settings.lineHeight],
    '--content-panel-paragraph-spacing': PARAGRAPH_SPACING,
    '--document-content-inline-padding': '0px',
    '--content-panel-text-color': settings.contrast === 'high'
      ? 'var(--color-text-primary)'
      : 'color-mix(in srgb, var(--color-text-primary) 92%, var(--color-text-secondary))'
  } as CSSProperties;
}

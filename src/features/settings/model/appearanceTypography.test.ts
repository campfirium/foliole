import { describe, expect, it } from 'vitest';

import {
  applyEditorTypographyScale,
  applyReadingLineHeight,
  resolveInterfaceFontFamily,
  resolveUiFontFamily
} from './appearanceTypography';

describe('applyEditorTypographyScale', () => {
  it('keeps markdown code close enough to the body size for Chinese inline code', () => {
    const root = document.createElement('div');

    applyEditorTypographyScale(root, 17);

    expect(root.style.getPropertyValue('--content-panel-code-font-size')).toBe('15.3px');
  });
});

describe('reading typography font stacks', () => {
  it('keeps default UI and text fonts on system-scoped variables', () => {
    expect(resolveUiFontFamily()).toBe('var(--font-family-interface)');
    expect(resolveInterfaceFontFamily('default', '')).toBe('var(--font-family-text)');
    expect(resolveUiFontFamily()).not.toContain('Inter');
    expect(resolveInterfaceFontFamily('default', '')).not.toContain('Inter');
  });

  it('keeps custom text fonts user-scoped with the text fallback', () => {
    expect(resolveInterfaceFontFamily('custom', 'Reader Face')).toBe("'Reader Face', var(--font-family-text)");
  });
});

describe('applyReadingLineHeight', () => {
  it('maps the three reading presets to one theme-independent value set', () => {
    const root = document.createElement('div');

    applyReadingLineHeight(root, 'compact');
    expect(root.style.getPropertyValue('--content-panel-line-height')).toBe('1.6');

    applyReadingLineHeight(root, 'standard');
    expect(root.style.getPropertyValue('--content-panel-line-height')).toBe('1.75');

    applyReadingLineHeight(root, 'relaxed');
    expect(root.style.getPropertyValue('--content-panel-line-height')).toBe('1.9');
  });
});

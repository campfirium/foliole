import { describe, expect, it } from 'vitest';

import {
  applyEditorTypographyScale,
  applyReadingLineHeight,
  applyReadingParagraphSpacing,
  normalizeReadingLineHeight,
  normalizeReadingParagraphSpacing,
  resolveInterfaceFontFamily,
  resolveUiFontFamily
} from './appearanceTypography';

describe('applyEditorTypographyScale', () => {
  it('keeps markdown code close enough to the body size for Chinese inline code', () => {
    const root = document.createElement('div');

    applyEditorTypographyScale(root, 17);

    expect(root.style.getPropertyValue('--content-panel-code-font-size')).toBe('15.3px');
    expect(root.style.getPropertyValue('--app-shellless-input-font-size')).toBe('15.64px');
  });

  it('keeps shell-less input size tied to reading size without becoming tiny or oversized', () => {
    const root = document.createElement('div');

    applyEditorTypographyScale(root, 12);
    expect(root.style.getPropertyValue('--app-shellless-input-font-size')).toBe('15px');

    applyEditorTypographyScale(root, 24);
    expect(root.style.getPropertyValue('--app-shellless-input-font-size')).toBe('22px');
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
  it('applies a normalized theme-independent line height value', () => {
    const root = document.createElement('div');

    applyReadingLineHeight(root, 1.75);
    expect(root.style.getPropertyValue('--content-panel-line-height')).toBe('1.75');
  });

  it('clamps and snaps custom line height to the supported range', () => {
    expect(normalizeReadingLineHeight(1.333)).toBe(1.35);
    expect(normalizeReadingLineHeight(1.1)).toBe(1.3);
    expect(normalizeReadingLineHeight(2.2)).toBe(2);
    expect(normalizeReadingLineHeight('bad')).toBe(1.75);
  });
});

describe('applyReadingParagraphSpacing', () => {
  it('applies a normalized font-relative paragraph spacing value', () => {
    const root = document.createElement('div');

    applyReadingParagraphSpacing(root, 0.75);
    expect(root.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('0.75em');
  });

  it('clamps and snaps custom paragraph spacing to the supported range', () => {
    expect(normalizeReadingParagraphSpacing(0.77)).toBe(0.75);
    expect(normalizeReadingParagraphSpacing(-1)).toBe(0);
    expect(normalizeReadingParagraphSpacing(2)).toBe(1.5);
    expect(normalizeReadingParagraphSpacing('bad')).toBe(0.75);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readStyles() {
  return readFileSync(join(process.cwd(), 'src/app/styles.css'), 'utf8');
}

function readWarmCanvasFilter(styles: string) {
  return styles.match(/data-pdf-reading-mode='warm'[\s\S]*?\.react-pdf__Page canvas\s*\{\s*filter:\s*([^;]+);/)?.[1] ?? '';
}

function readFilterNumber(filter: string, name: string) {
  const value = filter.match(new RegExp(`${name}\\(([^)]+)\\)`))?.[1];
  return value === undefined ? Number.NaN : Number(value);
}

function expectModePageBackground(styles: string, mode: string, color: string) {
  expect(styles).toContain(
    `:root[data-pdf-reading-mode='${mode}'] .pdf-document-surface :is(.react-pdf__Page, .pdf-document-page-placeholder) {\n  background: ${color};`
  );
}

function expectModeSurfaceBackground(styles: string, mode: string, color: string) {
  const block = styles.match(
    new RegExp(
      `:root\\[data-pdf-reading-mode='${mode}'\\] \\.pdf-document-surface,\\n:root\\[data-pdf-reading-mode='${mode}'\\] \\.pdf-document-surface :is\\(\\.pdf-document-scroll-container, \\.pdf-document-page-stack\\) \\{([^}]+)\\}`
    )
  )?.[1];
  expect(block).toContain(`background: ${color};`);
}

function expectInvertedPageBackgrounds(styles: string) {
  expect(styles).toContain(
    ":root[data-pdf-reading-mode='inverted'] .pdf-document-surface .pdf-document-page-placeholder {\n  background: var(--pdf-reading-inverted-page-color);"
  );
  expect(styles).toContain(
    ":root[data-pdf-reading-mode='inverted'] .pdf-document-surface .react-pdf__Page {\n  background: var(--pdf-reading-inverted-page-filter-source-color);"
  );
}

describe('PDF warm reading CSS', () => {
  it('keeps warm mode as a dim warm canvas filter without textLayer background coverage', () => {
    const styles = readStyles();
    const filter = readWarmCanvasFilter(styles);
    const brightness = readFilterNumber(filter, 'brightness');
    const sepia = readFilterNumber(filter, 'sepia');
    const saturation = readFilterNumber(filter, 'saturate');

    expect(filter).not.toContain('invert(');
    expect(brightness).toBeLessThanOrEqual(0.9);
    expect(brightness).toBeGreaterThan(0.65);
    expect(sepia).toBeGreaterThan(0);
    expect(saturation).toBeLessThan(1);
    expect(styles).not.toMatch(/data-pdf-reading-mode='warm'[\s\S]*?\.textLayer\s*\{[\s\S]*?background:/);
    expect(styles).not.toContain('--pdf-reading-warm-text-layer-color');
  });
});

describe('PDF reading mode backgrounds', () => {
  it('keeps rendered pages and placeholders on the same mode-aware background', () => {
    const styles = readStyles();

    expectModeSurfaceBackground(styles, 'original', 'rgb(var(--color-canvas))');
    expectModeSurfaceBackground(styles, 'inverted', 'var(--pdf-reading-inverted-surface-color)');
    expect(styles).toContain('--app-scrollbar-track-bg: var(--pdf-reading-inverted-surface-color);');
    expectModeSurfaceBackground(styles, 'warm', 'var(--pdf-reading-warm-surface-color)');
    expectModePageBackground(styles, 'original', 'rgb(var(--color-canvas))');
    expectInvertedPageBackgrounds(styles);
    expectModePageBackground(styles, 'warm', 'var(--pdf-reading-warm-surface-color)');
  });
});

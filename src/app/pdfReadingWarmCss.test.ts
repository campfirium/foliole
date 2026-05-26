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

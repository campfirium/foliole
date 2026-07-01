import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRODUCT_SOURCE_ROOT = 'src';
const LEGACY_RADIX_RADIUS_PATTERN = /--radius-(?:1|full)\b/;
const EDITOR_RADIUS_PATTERN = /--editor-radius-/;
const EDITOR_RADIUS_ALLOWED_PATHS = [
  'src/app/styles.css',
  'src/features/editor/'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function collectProductSourceFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const path = join(dir, entry);
    const stats = statSync(join(process.cwd(), path));
    if (stats.isDirectory()) {
      collectProductSourceFiles(path, files);
      continue;
    }
    if (/\.(css|ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(path.replaceAll('\\', '/'));
    }
  }
  return files;
}

function usesPattern(file: string, pattern: RegExp) {
  return pattern.test(readWorkspaceFile(file));
}

describe('radius token boundary', () => {
  it('keeps product code off legacy Radix radius variables', () => {
    const offenders = collectProductSourceFiles(PRODUCT_SOURCE_ROOT).filter((file) => usesPattern(file, LEGACY_RADIX_RADIUS_PATTERN));

    expect(offenders).toEqual([]);
  });

  it('keeps editor radius tokens inside editor-owned surfaces', () => {
    const offenders = collectProductSourceFiles(PRODUCT_SOURCE_ROOT).filter((file) => {
      if (!usesPattern(file, EDITOR_RADIUS_PATTERN)) {
        return false;
      }
      return !EDITOR_RADIUS_ALLOWED_PATHS.some((path) => file === path || file.startsWith(path));
    });

    expect(offenders).toEqual([]);
  });

  it('keeps editor radius tokens derived from the shared app radius scale', () => {
    const styles = readWorkspaceFile('src/app/styles.css');
    const editorRadiusBlock = styles.slice(styles.indexOf('--editor-radius-xs'), styles.indexOf('--editor-space-xxs'));

    expect(editorRadiusBlock).toContain('--editor-radius-xs: calc(var(--radius-sm) * 0.4)');
    expect(editorRadiusBlock).toContain('--editor-radius-sm: calc(var(--radius-sm) * 0.5)');
    expect(editorRadiusBlock).toContain('--editor-radius-md: var(--radius-sm)');
    expect(editorRadiusBlock).toContain('--editor-radius-lg: calc(var(--radius-sm) * 1.5)');
    expect(editorRadiusBlock).toContain('--editor-radius-xl: var(--radius-md)');
    expect(editorRadiusBlock).toContain('--editor-radius-popover: var(--radius-lg)');
    expect(editorRadiusBlock).not.toMatch(/--editor-radius-[^:]+:\s*[0-9.]+rem/);
  });
});

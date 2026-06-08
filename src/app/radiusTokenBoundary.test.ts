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
      files.push(path);
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
});

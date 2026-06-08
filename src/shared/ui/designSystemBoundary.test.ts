import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SHARED_UI_ROOT = 'src/shared/ui';
const BARE_NUMERIC_TYPE_OR_RADIUS_PATTERN = /\b(?:text|rounded)-\[[0-9.]+(?:px|rem)\]/;
const ARBITRARY_SHADOW_PATTERN = /\bshadow-\[/;

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function collectSharedUiSourceFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const path = join(dir, entry);
    const stats = statSync(join(process.cwd(), path));
    if (stats.isDirectory()) {
      collectSharedUiSourceFiles(path, files);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('shared UI design system boundary', () => {
  it('keeps shared wrappers on named type, radius, and shadow tokens', () => {
    const offenders = collectSharedUiSourceFiles(SHARED_UI_ROOT).filter((file) => {
      const content = readWorkspaceFile(file);
      return BARE_NUMERIC_TYPE_OR_RADIUS_PATTERN.test(content) || ARBITRARY_SHADOW_PATTERN.test(content);
    });

    expect(offenders).toEqual([]);
  });
});

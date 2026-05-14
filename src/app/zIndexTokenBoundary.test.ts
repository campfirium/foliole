import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRODUCT_SOURCE_ROOT = 'src';
const NUMERIC_ARBITRARY_Z_CLASS_PATTERN = /\bz-\[\d+\]\b/;
const DEFAULT_NUMERIC_Z_CLASS_PATTERN = /\bz-(?:10|20|30|40|50)\b/;
const NUMERIC_TS_Z_INDEX_PATTERN = /\bzIndex:\s*['"]?\d+/;
const NUMERIC_CSS_Z_INDEX_PATTERN = /z-index:\s*\d+/;
const REQUIRED_Z_ALIASES = [
  'local-base',
  'local-raised',
  'local-overlay',
  'local-control',
  'local-feedback',
  'local-accent',
  'surface',
  'surface-overlay',
  'surface-raised',
  'workspace-overlay',
  'floating',
  'debug',
  'modal-overlay',
  'modal',
  'dropdown',
  'panel-popover',
  'preview-dialog',
  'popover-elevated'
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

describe('z-index token boundary', () => {
  it('keeps product code off numeric z-index classes and values', () => {
    const offenders = collectProductSourceFiles(PRODUCT_SOURCE_ROOT).flatMap((file) => {
      const content = readWorkspaceFile(file);
      const isOffender =
        NUMERIC_ARBITRARY_Z_CLASS_PATTERN.test(content) ||
        DEFAULT_NUMERIC_Z_CLASS_PATTERN.test(content) ||
        NUMERIC_TS_Z_INDEX_PATTERN.test(content) ||
        NUMERIC_CSS_Z_INDEX_PATTERN.test(content);
      return isOffender ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('keeps semantic z-index aliases wired to CSS variables', () => {
    const tailwindConfig = readWorkspaceFile('tailwind.config.js');
    const zIndexTokens = readWorkspaceFile('src/app/tokens/z-index.css');

    for (const alias of REQUIRED_Z_ALIASES) {
      const variableName = `--z-${alias}`;
      const configKey = alias.includes('-') ? `'${alias}'` : alias;
      expect(tailwindConfig).toContain(`${configKey}: 'var(${variableName})'`);
      expect(zIndexTokens).toContain(variableName);
    }
  });
});

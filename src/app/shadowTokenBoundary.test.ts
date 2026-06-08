import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRODUCT_SOURCE_ROOT = 'src';
const DEFAULT_SHADOW_CLASS_PATTERN = /\bshadow-(?:sm|md|lg|xl|2xl)\b/;
const REQUIRED_SHADOW_ALIASES = [
  'control',
  'inspector-section',
  'page',
  'marker',
  'picker-thumb-ring',
  'picker-thumb-ring-strong',
  'debug'
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
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('shadow token boundary', () => {
  it('keeps product code off Tailwind default shadow classes', () => {
    const offenders = collectProductSourceFiles(PRODUCT_SOURCE_ROOT).flatMap((file) => {
      const content = readWorkspaceFile(file);
      return DEFAULT_SHADOW_CLASS_PATTERN.test(content) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('keeps workspace surface color picker ring shadows on named tokens', () => {
    const content = readWorkspaceFile('src/features/settings/components/sections/WorkspaceSurfaceColorPickerPanel.tsx');

    expect(content).not.toContain('shadow-[');
    expect(content).toContain('shadow-picker-thumb-ring');
  });

  it('keeps semantic shadow aliases wired to CSS variables', () => {
    const tailwindConfig = readWorkspaceFile('tailwind.config.js');
    const shadowTokens = readWorkspaceFile('src/app/tokens/shadows.css');

    for (const alias of REQUIRED_SHADOW_ALIASES) {
      const variableName = `--shadow-${alias}`;
      const configKey = alias.includes('-') ? `'${alias}'` : alias;
      expect(tailwindConfig).toContain(`${configKey}: 'var(${variableName})'`);
      expect(shadowTokens).toContain(variableName);
    }
  });

  it('keeps dark mode shadows on explicit token overrides', () => {
    const shadowTokens = readWorkspaceFile('src/app/tokens/shadows.css');
    const darkOverrideStart = shadowTokens.indexOf(":root[data-resolved-base-color='dark']");
    const darkOverride = shadowTokens.slice(darkOverrideStart);

    expect(darkOverrideStart).toBeGreaterThan(-1);
    expect(darkOverride).toContain('--shadow-popover: 0 20px 44px rgb(0 0 0 / 0.42)');
    expect(darkOverride).toContain('--shadow-panel: 0 14px 30px rgb(0 0 0 / 0.34)');
    expect(darkOverride).toContain('--shadow-settings: 0 20px 46px rgb(0 0 0 / 0.36), 0 2px 8px rgb(0 0 0 / 0.24)');
  });
});

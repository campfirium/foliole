import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('reading typography token check', () => {
  it('accepts the shipped light and dark reading colors through semantic roles', () => {
    const result = spawnSync(process.execPath, ['scripts/check-reading-typography-tokens.mjs'], {
      cwd: process.cwd(), encoding: 'utf8'
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[check-reading-typography-tokens] ok');
  });

  it.each([
    ['--role-content-text: var(--role-text);', '--role-content-text: var(--missing-text);',
      'light: could not resolve --content-panel-text-color'],
    ['--role-content-text: var(--role-text);', '--role-content-text: #ffffff;',
      'light: text L 1.000 outside'],
    ['--role-content-text: #d8d8d8;', '--role-content-text: #161918;',
      'dark: text L'],
    ['--role-content-text: #d8d8d8;', '--role-content-text: #ff0000;',
      'dark: text chroma']
  ])('rejects invalid reading colors when %s becomes %s', (original, replacement, failure) => {
    const artifacts = join(process.cwd(), '.tmp/artifacts');
    mkdirSync(artifacts, { recursive: true });
    const fixture = mkdtempSync(join(artifacts, 'reading-typography-'));
    try {
      for (const path of [
        'src/app/generated/appearance-colors.css', 'src/app/tokens/roles.css', 'src/app/styles.css'
      ]) {
        mkdirSync(join(fixture, path, '..'), { recursive: true });
        const css = readWorkspaceFile(path);
        writeFileSync(join(fixture, path), path.endsWith('/roles.css') ? css.replace(original, replacement) : css);
      }
      const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts/check-reading-typography-tokens.mjs')], {
        cwd: fixture, encoding: 'utf8'
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(failure);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

});

describe('reading typography guards', () => {
  it('keeps shared renderer typography guards without forcing WebKit font smoothing', () => {
    const styles = readWorkspaceFile('src/app/styles.css');

    expect(styles).not.toContain('-webkit-font-smoothing:');
    expect(styles).toContain('font-synthesis-weight: none;');
    expect(styles).toContain('text-rendering: optimizeLegibility;');
    expect(styles).toContain('strong,\nb {\n  font-weight: 600;');
  });

  it('keeps UI defaults on system fonts and keeps Inter out of default text variables', () => {
    const styles = readWorkspaceFile('src/app/styles.css');

    expect(styles).toContain("--font-family-interface: system-ui, -apple-system, 'Segoe UI Variable', 'Segoe UI', sans-serif;");
    expect(styles).toContain("--font-family-text: system-ui, -apple-system, 'Segoe UI Variable', 'Segoe UI', sans-serif;");
    expect(styles).toMatch(/:root:lang\(zh\)[\s\S]*--font-family-text:/);
    expect(styles).toMatch(/:root:lang\(ja\)[\s\S]*--font-family-text:/);
    expect(styles).toMatch(/:root:lang\(ko\)[\s\S]*--font-family-text:/);
    expect(styles.match(/--font-family-(?:interface|text):[^\n]+/g)?.join('\n') ?? '').not.toContain('Inter');
  });

  it('keeps markdown content on content-panel typography variables', () => {
    const theme = readWorkspaceFile('src/features/editor/adapters/liveMarkdownTheme.ts');
    const styles = readWorkspaceFile('src/app/styles.css');

    expect(theme).toContain("fontFamily: 'var(--content-panel-font-family, var(--font-family-sans))'");
    expect(theme).toContain("lineHeight: 'var(--content-panel-line-height, 1.75)'");
    expect(theme).toContain("'.cm-line.cm-line-paragraph': { paddingBottom: 'var(--content-panel-paragraph-spacing, 0.75em)' }");
    expect(styles).toContain('line-height: var(--content-panel-line-height, 1.75);');
    expect(styles).toContain('overflow-y: scroll;');
  });
});

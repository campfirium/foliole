import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('reading typography guards', () => {
  it('keeps the shared renderer font smoothing guards in styles.css', () => {
    const styles = readWorkspaceFile('src/app/styles.css');

    expect(styles).toContain('-webkit-font-smoothing: antialiased;');
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
  });
});

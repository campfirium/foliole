import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('shell-less surface token boundary', () => {
  it('keeps shell-less surfaces anchored to the workspace document background family', () => {
    const appStyles = readWorkspaceFile('src/app/styles.css');
    const styles = readWorkspaceFile('src/app/tokens/shellless-surfaces.css');

    expect(appStyles).toContain('@import "./tokens/shellless-surfaces.css";');
    expect(styles).toContain('--app-shellless-surface-bg: color-mix(in srgb, var(--workspace-region-main-document-bg) 88%, var(--workspace-region-main-document-token-bg) 12%)');
    expect(styles).toContain('--app-shellless-input-bg: var(--app-shellless-surface-bg)');
    expect(styles).toContain('--app-shellless-border-color: color-mix(in oklab, var(--app-shellless-surface-bg)');
    expect(styles).toContain('--app-shellless-divider-color: color-mix(in oklab, var(--app-shellless-surface-bg)');
    expect(styles).toContain("--app-shellless-control-fg: rgb(var(--color-foreground) / 0.52)");
    expect(styles).toContain('--app-shellless-shadow: 0 8px 22px rgb(15 17 19 / 0.045)');
    expect(styles).not.toContain('--app-shellless-surface-bg: var(--app-floating-surface-bg)');
    expect(styles).not.toContain('--app-shellless-border-color: var(--app-floating-border-color)');
    expect(styles).not.toContain('--app-shellless-shadow: var(--shadow-popover)');
    expect(styles).not.toContain('var(--workspace-region-main-rail-bg)');
  });

  it('keeps dark shell-less surfaces close to the raw document background', () => {
    const styles = readWorkspaceFile('src/app/tokens/shellless-surfaces.css');

    expect(styles).toContain(":root[data-resolved-base-color='dark']");
    expect(styles).toContain('--app-shellless-surface-bg: color-mix(in srgb, var(--workspace-region-main-document-bg) 92%, var(--workspace-region-main-document-token-bg) 8%)');
    expect(styles).toContain('--app-shellless-control-fg: rgb(var(--color-foreground) / 0.58)');
    expect(styles).toContain('--app-shellless-shadow: 0 10px 26px rgb(0 0 0 / 0.18)');
  });

  it('keeps shell-less input typography tied to content-panel text settings', () => {
    const styles = readWorkspaceFile('src/app/tokens/shellless-surfaces.css');

    expect(styles).toContain('--app-shellless-ui-font-family: var(--app-interface-font-family');
    expect(styles).toContain('--app-shellless-input-font-family: var(--content-panel-font-family');
    expect(styles).toContain('--app-shellless-input-font-size: 15px');
    expect(styles).toContain('--app-shellless-content-inline-padding: 26px');
    expect(styles).toContain('--app-shellless-input-padding-block-start: 24px');
    expect(styles).toContain('--app-shellless-input-padding-block-end: 12px');
    expect(styles).toContain(
      '--app-shellless-input-line-height: clamp(1.45, var(--content-panel-line-height, 1.75), 1.75)'
    );
  });

  it('exposes shell-less semantic tokens through Tailwind aliases', () => {
    const tailwindConfig = readWorkspaceFile('tailwind.config.js');

    expect(tailwindConfig).toContain("'shellless-surface': 'var(--app-shellless-surface-bg)'");
    expect(tailwindConfig).toContain("'shellless-control-fg': 'var(--app-shellless-control-fg)'");
    expect(tailwindConfig).toContain("'shellless-input': ['var(--app-shellless-input-font-family)']");
    expect(tailwindConfig).toContain("'shellless-input': [\n          'var(--app-shellless-input-font-size)'");
    expect(tailwindConfig).toContain("shellless: 'var(--app-shellless-shadow)'");
    expect(tailwindConfig).toContain("shellless: 'var(--app-shellless-radius)'");
  });
});

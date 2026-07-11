import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('action hierarchy boundary', () => {
  it('keeps AppButton off the legacy primary variant name', () => {
    const buttonSource = readWorkspaceFile('src/shared/ui/Button.tsx');

    expect(buttonSource).toContain("type ButtonVariant = 'default' | 'ghost' | 'subtle' | 'emphasis' | 'danger' | 'list'");
    expect(buttonSource).not.toContain("'primary'");
    expect(buttonSource).not.toContain('"primary"');
  });

  it('keeps startup fallback aligned with emphasis instead of primary', () => {
    const styles = readWorkspaceFile('src/app/styles.css');
    const startupButtonRule = styles.slice(styles.indexOf(".startup-surface__button[data-variant='emphasis']"));

    expect(startupButtonRule).toContain(".startup-surface__button[data-variant='emphasis']");
    expect(styles).not.toContain(".startup-surface__button[data-variant='primary']");
  });

  it('keeps emphasis actions outlined instead of using a filled surface', () => {
    const buttonSource = readWorkspaceFile('src/shared/ui/Button.tsx');

    expect(buttonSource).toContain("return 'border border-border-strong bg-transparent font-medium");
    expect(buttonSource).not.toContain('bg-[color-mix');
  });
});

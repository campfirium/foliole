import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('color token boundary', () => {
  it('keeps legacy Tailwind action color aliases wired to semantic CSS variables', () => {
    const tailwindConfig = readWorkspaceFile('tailwind.config.js');

    expect(tailwindConfig).toContain("primary: {\n          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)'");
    expect(tailwindConfig).toContain("foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)'");
    expect(tailwindConfig).toContain("destructive: {\n          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)'");
    expect(tailwindConfig).toContain("foreground: 'rgb(var(--color-error-foreground) / <alpha-value>)'");
    expect(tailwindConfig).not.toContain("DEFAULT: '#5f6368'");
    expect(tailwindConfig).not.toContain("DEFAULT: '#fb7185'");
  });
});

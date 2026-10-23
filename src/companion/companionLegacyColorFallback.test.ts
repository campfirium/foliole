import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

function legacyColorFallbackDeclarations() {
  const css = readFileSync(join(process.cwd(), 'src/companion/companionMinimal.css'), 'utf8');
  const declarations = new Map<string, string>();
  postcss.parse(css).walkAtRules('supports', (rule) => {
    if (!/^not\s*\(color:\s*color-mix\(/u.test(rule.params)) {
      return;
    }
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
}

describe('companion legacy WebView color fallback', () => {
  it('keeps dialog band dividers and floating borders visible without color-mix support', () => {
    const declarations = legacyColorFallbackDeclarations();

    for (const token of ['--app-floating-divider-color', '--app-floating-border-color']) {
      const value = declarations.get(token);
      expect(value, token).toBeDefined();
      expect(value).not.toContain('color-mix(');
      expect(value).toMatch(/var\(--color-foreground\)\s*\/\s*0\.\d+/u);
    }
  });
});

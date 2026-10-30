import { readFileSync } from 'node:fs';

import postcss from 'postcss';
import { expect, it } from 'vitest';

function surfaceColors(mode: 'light' | 'dark') {
  const values = new Map<string, string>();
  for (const file of ['src/app/styles.css', 'src/app/tokens/roles.css']) {
    const css = postcss.parse(readFileSync(file, 'utf8'));
    css.walkRules(rule => {
      if (rule.selector !== ':root'
        && !(mode === 'dark' && rule.selector === ":root[data-resolved-base-color='dark']")) return;
      rule.walkDecls(declaration => values.set(declaration.prop, declaration.value));
    });
  }
  function resolve(value: string): string {
    return value.replace(/var\((--[\w-]+)\)/gu, (_, token: string) => {
      const replacement = values.get(token);
      if (!replacement) throw new Error(`Missing color token: ${token}`);
      return resolve(replacement);
    });
  }
  return {
    content: resolve(values.get('--companion-content')!),
    page: resolve(values.get('--companion-base')!)
  };
}

it.each(['light', 'dark'] as const)('keeps ordinary companion content on the page surface in %s mode', mode => {
  const colors = surfaceColors(mode);
  expect(colors.content).toBe(colors.page);
});

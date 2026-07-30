import { describe, expect, it } from 'vitest';

import { compileCompanionCustomCssCollection, compileCompanionCustomCssSource } from './companionCustomCssCompiler';
import {
  MAX_COMPANION_CUSTOM_CSS_SNIPPETS,
  MAX_COMPANION_CUSTOM_CSS_SOURCE_BYTES
} from './companionCustomCssModel';

function uuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

function validSnippet(overrides: Record<string, unknown> = {}) {
  return { enabled: true, id: uuid(1), name: 'Safe', sourceCss: 'p { color: red; }', ...overrides };
}

describe('companion custom CSS syntax and injection rejection boundary', () => {
  it.each([
    ['syntax error', 'p { color: red'],
    ['at-rule', '@media screen { p { color: red; } }'],
    ['nested rule', 'p { strong { color: red; } }'],
    ['nesting selector', '& p { color: red; }'],
    ['selector escape', '.safe\\:hover { color: red; }'],
    ['selector comment', '.safe/* hidden */ { color: red; }'],
    ['value escape', 'p { color: r\\65 d; }'],
    ['value comment', 'p { color: r/* hidden */ed; }']
  ])('rejects %s without producing compiled CSS', (_label, sourceCss) => {
    expect(() => compileCompanionCustomCssSource(sourceCss)).toThrow();
  });

  it.each([
    'url(https://example.com/a.png)',
    'image(url(a.png))',
    'src(https://example.com/a.png)',
    'image-set(url(a.png) 1x)',
    '-webkit-image-set(url(a.png) 1x)',
    'expression(alert(1))',
    'paint(topic-worklet)',
    'cross-fade(url(a.png), red, 50%)'
  ])('rejects external or script-like value %s', (value) => {
    expect(() => compileCompanionCustomCssSource(`p { background: ${value}; }`)).toThrow();
  });

  it.each(['src', 'behavior', '-moz-binding', '*color', '_color'])('rejects unsafe property %s', (property) => {
    expect(() => compileCompanionCustomCssSource(`p { ${property}: red; }`)).toThrow();
  });

  it.each([
    'html p',
    'body > p',
    ':root p',
    ':is(body, p)',
    '[data-companion-readable-document="true"] p',
    '[data-companion-article-document] p'
  ])('rejects selector outside the Topic descendant boundary: %s', (selector) => {
    expect(() => compileCompanionCustomCssSource(`${selector} { color: red; }`)).toThrow();
  });
});

describe('companion custom CSS collection rejection boundary', () => {
  it('rejects malformed versions, fields, ids, and names', () => {
    expect(() => compileCompanionCustomCssCollection({ snippets: [], version: 2 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({ extra: true, snippets: [], version: 1 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({ snippets: [validSnippet({ extra: true })], version: 1 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({
      snippets: [validSnippet(), validSnippet({ name: 'Duplicate' })], version: 1
    })).toThrow();
    expect(() => compileCompanionCustomCssCollection({ snippets: [validSnippet({ name: ' ' })], version: 1 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({ snippets: [validSnippet({ name: 'x'.repeat(81) })], version: 1 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({ snippets: [validSnippet({ id: 'not-a-uuid' })], version: 1 })).toThrow();
  });

  it('rejects snippet count and source byte limits', () => {
    const snippets = Array.from({ length: MAX_COMPANION_CUSTOM_CSS_SNIPPETS + 1 }, (_, index) => (
      validSnippet({ id: uuid(index + 1) })
    ));
    expect(() => compileCompanionCustomCssCollection({ snippets, version: 1 })).toThrow();
    expect(() => compileCompanionCustomCssCollection({
      snippets: [validSnippet({ sourceCss: 'x'.repeat(MAX_COMPANION_CUSTOM_CSS_SOURCE_BYTES + 1) })],
      version: 1
    })).toThrow();
  });

  it('rejects total source and expanded compiled byte limits', () => {
    const largeSource = `/*${'x'.repeat(15_000)}*/p{color:red}`;
    expect(() => compileCompanionCustomCssCollection({
      snippets: Array.from({ length: 5 }, (_, index) => validSnippet({ id: uuid(index + 1), sourceCss: largeSource })),
      version: 1
    })).toThrow();

    const expandedSelectors = `${'a,'.repeat(4_000)}a{color:red}`;
    expect(() => compileCompanionCustomCssCollection({
      snippets: [validSnippet({ sourceCss: expandedSelectors })], version: 1
    })).toThrow();
  });
});

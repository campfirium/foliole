import { describe, expect, it } from 'vitest';

import {
  compileCompanionCustomCssCollection,
  compileCompanionCustomCssSource
} from '../shared/customCss/companionCustomCssCompiler';

function collection(snippets: Array<{ enabled?: boolean; id: string; name: string; sourceCss: string }>) {
  return {
    snippets: snippets.map((snippet) => ({ enabled: snippet.enabled ?? true, ...snippet })),
    version: 1
  };
}

const ID_ONE = '00000000-0000-4000-8000-000000000001';
const ID_TWO = '00000000-0000-4000-8000-000000000002';

describe('companion custom CSS compiler', () => {
  it('preserves global selectors, function commas, declarations, and order', () => {
    const result = compileCompanionCustomCssCollection(collection([
      { id: ID_ONE, name: ' Headings ', sourceCss: ':root, body, :is(h1, h2) { color: red !important; --topic-tone: #333; }' },
      { id: ID_TWO, name: 'Links', sourceCss: 'a { text-decoration: underline; }' }
    ]));

    expect(result.collection.snippets[0]?.name).toBe('Headings');
    expect(result.compiledCss).toContain(':root, body, :is(h1, h2) {');
    expect(result.compiledCss).toContain('color: red !important');
    expect(result.compiledCss).toContain('--topic-tone: #333');
    expect(result.compiledCss.indexOf('color: red')).toBeLessThan(result.compiledCss.indexOf('text-decoration'));
  });

  it('removes comments and omits disabled compiled CSS from the runtime output', () => {
    const result = compileCompanionCustomCssCollection(collection([
      { enabled: false, id: ID_ONE, name: 'Off', sourceCss: '/* root */ p { /* body */ color: red; }' },
      { id: ID_TWO, name: 'On', sourceCss: 'blockquote { opacity: .8; }' }
    ]));

    expect(result.compiledSnippets[0]?.compiledCss).not.toContain('/*');
    expect(result.compiledCss).not.toContain('color: red');
    expect(result.compiledCss).toContain('blockquote');
  });

  it('accepts empty source and keeps universal selectors global', () => {
    expect(compileCompanionCustomCssSource('')).toBe('');
    expect(compileCompanionCustomCssSource('* { font: inherit; }')).toBe('* { font: inherit; }');
  });
});

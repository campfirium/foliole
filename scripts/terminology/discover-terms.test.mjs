// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { loadTerms } from './check-terms.mjs';
import { discoverNewWords, knownVocabulary, tokenize } from './discover-terms.mjs';

const terms = loadTerms();
const EN = 'src/shared/localization/locales/enSample.ts';

describe('discover-terms', () => {
  it('ignores placeholders and short words when tokenizing', () => {
    expect(tokenize('Move {count} topics to a folder')).toEqual(['move', 'topics', 'folder']);
  });

  it('reports a word that is new to short UI labels, the way nested once slipped in', () => {
    const known = knownVocabulary(['Show topics', 'Move to folder'], terms);
    const found = discoverNewWords([{ file: EN, line: 3, text: "  'a.b': 'Show stacked topics'," }], known);
    expect(found.map((entry) => entry.word)).toEqual(['stacked']);
    expect(found[0].samples[0]).toContain('enSample.ts:3');
  });

  it('skips known words, plurals of known words, adverbs, long prose, and non-English catalogs', () => {
    const known = knownVocabulary(['Open the library'], terms);
    const lines = [
      { file: EN, line: 1, text: "  'a': 'Open libraries quickly'," },
      { file: EN, line: 2, text: "  'b': 'This long help sentence mentions occlusion among many other ordinary words.'," },
      { file: 'src/shared/localization/locales/zhHansSample.ts', line: 1, text: "  'c': 'Occlusion'," }
    ];
    expect(discoverNewWords(lines, known)).toEqual([]);
  });
});

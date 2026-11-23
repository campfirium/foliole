import { describe, expect, it } from 'vitest';

import { allocateAideAttachedContext, renderAideContextUnit } from './aideAttachedContextAllocation.js';
import {
  createDefaultAideAttachedContextSettings,
  normalizeAideAttachedContextSettings,
  type AideAttachedContextSettings
} from './aideAttachedContextSettings.js';
import { estimateAideTokens, truncateAideTextAtSentence } from './aideTokenEstimate.js';

function settings(items: Array<[AideAttachedContextSettings['items'][number]['key'], number, boolean?]>, total: number) {
  return normalizeAideAttachedContextSettings({
    items: items.map(([key, limit, enabled]) => ({ enabled: enabled ?? true, key, limit })),
    totalBudget: total
  });
}

const sentence = (word: string) => `${word} ${word} ${word} ${word} ${word} ${word} ${word}.`; // 41 chars -> 11 tokens

describe('Aide token estimate', () => {
  it('counts CJK characters as one token and four other characters as one', () => {
    expect(estimateAideTokens('你好')).toBe(2);
    expect(estimateAideTokens('abcdefgh')).toBe(2);
    expect(estimateAideTokens('你好abcde')).toBe(4);
  });

  it('cuts only at sentence ends', () => {
    expect(truncateAideTextAtSentence('One two. Three four five six seven eight.', 3)).toBe('One two.');
    expect(truncateAideTextAtSentence('A very long sentence without an early stop.', 2)).toBe('');
  });
});

describe('allocateAideAttachedContext', () => {
  it('defaults sum to the total budget', () => {
    const defaults = createDefaultAideAttachedContextSettings();
    expect(defaults.totalBudget).toBe(2100);
    expect(defaults.items.map((item) => item.key)).toEqual([
      'selection', 'metadata', 'surrounding', 'outline', 'location', 'annotations'
    ]);
  });

  it('sends short content as is without padding', () => {
    const result = allocateAideAttachedContext(
      { metadata: [{ atomic: true, text: 'title: Short' }], selection: [{ text: 'Tiny.' }] },
      createDefaultAideAttachedContextSettings()
    );
    expect(result.map((item) => [item.key, item.truncated])).toEqual([['selection', false], ['metadata', false]]);
  });

  it('gives budget left by short items to later items that did not fit', () => {
    const long = [sentence('alpha'), sentence('beta'), sentence('gamma'), sentence('delta')].join(' ');
    const result = allocateAideAttachedContext(
      { metadata: [{ text: 'm.' }], selection: [{ text: long }] },
      settings([['selection', 22], ['metadata', 30]], 60)
    );
    const selection = result.find((item) => item.key === 'selection');
    expect(selection?.tokens).toBeGreaterThan(22);
    expect(selection?.tokens).toBeLessThanOrEqual(59);
  });

  it('never exceeds the total budget and marks the cut item', () => {
    const many = Array.from({ length: 300 }, (_, index) => sentence(`w${index}`)).join(' ');
    const result = allocateAideAttachedContext(
      { annotations: [{ text: many }], selection: [{ text: many }], surrounding: [{ text: many }] },
      createDefaultAideAttachedContextSettings()
    );
    const used = result.reduce((sum, item) => sum + item.tokens, 0);
    expect(used).toBeLessThanOrEqual(2100);
    expect(result.every((item) => item.truncated)).toBe(true);
    for (const item of result) {
      expect(item.units.map(renderAideContextUnit).join('').trim().endsWith('.')).toBe(true);
    }
  });

});

describe('allocateAideAttachedContext limits', () => {
  it('leaves out disabled items even when budget remains', () => {
    const result = allocateAideAttachedContext(
      { metadata: [{ atomic: true, text: 'title: Book' }], selection: [{ text: 'Chosen.' }] },
      settings([['selection', 800, false], ['metadata', 100]], 2100)
    );
    expect(result.map((item) => item.key)).toEqual(['metadata']);
  });

  it('later items may get nothing when the total is lowered', () => {
    const result = allocateAideAttachedContext(
      { metadata: [{ atomic: true, text: 'title: A rather long title here' }], selection: [{ text: sentence('x') }] },
      settings([['selection', 800], ['metadata', 100]], 11)
    );
    expect(result.map((item) => item.key)).toEqual(['selection']);
  });

  it('drops related content already attached and reuses the saved budget', () => {
    const chosen = 'More context is not always better.';
    const extra = sentence('omega');
    const result = allocateAideAttachedContext({
      annotations: [
        { dedupe: true, label: 'Source excerpt: ', text: `${chosen} ${extra}` },
        { dedupe: true, label: 'Excerpt: ', text: chosen }
      ],
      selection: [{ text: chosen }]
    }, createDefaultAideAttachedContextSettings());
    const annotations = result.find((item) => item.key === 'annotations');
    expect(annotations?.units).toEqual([{ dedupe: true, label: 'Source excerpt: ', text: extra }]);
  });

  it('keeps outline priority but shows it in document order', () => {
    const result = allocateAideAttachedContext({
      outline: [
        { atomic: true, rank: 2, text: '- Current (current)' },
        { atomic: true, rank: 1, text: '- Previous' },
        { atomic: true, rank: 5, text: '- Far away chapter heading' }
      ]
    }, settings([['outline', 10]], 10));
    expect(result[0]?.units.map((unit) => unit.text)).toEqual(['- Previous', '- Current (current)']);
    expect(result[0]?.truncated).toBe(true);
  });
});

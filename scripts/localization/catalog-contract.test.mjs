import { describe, expect, it } from 'vitest';

import { compareEntry, sourceConflicts } from './catalog-contract.mjs';

describe('localization catalog contract', () => {
  it('protects placeholders, structure, and registered literals', () => {
    const literals = { exact: [], embedded: ['WordPress'] };
    expect(compareEntry('sample', 'Publish to WordPress {count}', 'Auf der Website veröffentlichen', literals))
      .toEqual([
        'sample: structure or placeholders changed',
        'sample: protected literal changed'
      ]);
  });

  it('blocks AI input when a reviewer records an English-Chinese semantic conflict', () => {
    const domains = [{ en: { 'sample.key': 'Delete topic' }, zh: { 'sample.key': '保留主题' } }];
    expect(sourceConflicts(domains, { exact: [], embedded: [] }, { 'sample.key': 'opposite action commitment' }))
      .toContain('sample.key: opposite action commitment');
  });
});

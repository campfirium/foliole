import { describe, expect, it } from 'vitest';

import { assertDemoPack, DEMO_SOURCE_LOCALE_DEFAULT, DEMO_TRANSLATABLE_FIELDS, type DemoPack } from './demoPack';
import { GENERATED_DEMO_PACK, GENERATED_DEMO_PACKS } from './generated/demoPack';

function clonePack(): DemoPack {
  return structuredClone(GENERATED_DEMO_PACK);
}

describe('Demo Pack contract', () => {
  it('publishes complete localized Guides without English fallbacks', () => {
    expect(Object.keys(GENERATED_DEMO_PACKS).sort()).toEqual([
      'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'zh-hans', 'zh-hant'
    ]);
    expect(Object.values(GENERATED_DEMO_PACKS).every((pack) => (
      pack.topics.length === 9 && pack.source.warnings.length === 0
    ))).toBe(true);
  });

  it('accepts the generated v3 Demo Pack', () => {
    expect(assertDemoPack(clonePack())).toBeTruthy();
  });

  it('requires source locale and translatable fields', () => {
    const pack = clonePack();

    expect(pack.sourceLocale).toBe(DEMO_SOURCE_LOCALE_DEFAULT);
    expect(pack.translatableFields).toEqual(DEMO_TRANSLATABLE_FIELDS);

    delete (pack as Partial<DemoPack>).sourceLocale;
    expect(() => assertDemoPack(pack)).toThrow('sourceLocale');
  });

  it('rejects unsupported translatable fields', () => {
    const pack = clonePack();
    pack.translatableFields = ['topics[].unknown' as (typeof pack.translatableFields)[number]];

    expect(() => assertDemoPack(pack)).toThrow('Unsupported Demo Pack translatable field');
  });

  it('requires topic reading seeds', () => {
    const pack = clonePack();
    delete (pack.topics[0] as Partial<(typeof pack.topics)[number]>).readingSeed;

    expect(() => assertDemoPack(pack)).toThrow('missing reading seed');
  });

  it('requires review schedule seeds to match review items', () => {
    const pack = clonePack();
    const topic = pack.topics[0];
    if (!topic) throw new Error('Missing fixture topic.');
    topic.reviewItems = [{
      answer: 'Answer',
      id: `${topic.id}.sample-item`,
      kind: 'item',
      prompt: 'Prompt',
      title: 'Sample item'
    }];
    topic.reviewScheduleSeeds = [];

    expect(() => assertDemoPack(pack)).toThrow('review schedule seed count does not match review items');
  });

  it('rejects invalid relative day offsets', () => {
    const pack = clonePack();
    const topic = pack.topics[0];
    if (!topic) throw new Error('Missing fixture topic.');
    topic.readingSeed.nextAt.dayOffset = -1;

    expect(() => assertDemoPack(pack)).toThrow('missing reading seed');
  });
});

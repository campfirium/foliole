import { describe, expect, it } from 'vitest';

import { assertDemoPack, type DemoPack } from './demoPack';
import { GENERATED_DEMO_PACK } from './generated/demoPack';

function clonePack(): DemoPack {
  return structuredClone(GENERATED_DEMO_PACK);
}

describe('Demo Pack contract', () => {
  it('accepts the generated v2 Demo Pack', () => {
    expect(assertDemoPack(clonePack())).toBeTruthy();
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

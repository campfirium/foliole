import { describe, expect, it } from 'vitest';

import { collectLenientTripleStarCandidates } from './markdownLenientTripleStarProjection';

describe('markdownLenientTripleStarProjection', () => {
  it('collects malformed triple-star strong emphasis with trailing content space', () => {
    expect(collectLenientTripleStarCandidates('***小火箭方法。 ***')).toEqual([
      {
        contentFrom: 1,
        contentTo: 12,
        from: 0,
        kind: 'emphasis',
        syntaxRanges: [
          { from: 0, to: 1 },
          { from: 12, to: 13 }
        ],
        text: '**小火箭方法。 **',
        to: 13
      },
      {
        contentFrom: 3,
        contentTo: 10,
        from: 1,
        kind: 'strong',
        syntaxRanges: [
          { from: 1, to: 3 },
          { from: 10, to: 12 }
        ],
        text: '小火箭方法。 ',
        to: 12
      }
    ]);
  });

  it('leaves regular triple-star syntax to the markdown parser', () => {
    expect(collectLenientTripleStarCandidates('***bold***')).toEqual([]);
  });
});

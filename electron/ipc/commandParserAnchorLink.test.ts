import { describe, expect, it } from 'vitest';

import { asAnchorLink } from './commandParserAnchorLink.js';

function createFormulaLocator() {
  return {
    display: 'inline',
    fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
    formulaSource: '$E=mc^2$',
    kind: 'formula-region',
    occurrenceKey: 'inline:7:15:E=mc^2',
    selection: {
      algorithm: 'katex-dom-leaf-v1',
      fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
      leaves: [
        {
          path: [0],
          structureFingerprint: 'mord',
          textFingerprint: 'E=mc2'
        }
      ]
    }
  };
}

describe('asAnchorLink', () => {
  it('accepts formula region locators without requiring visual x/y fields', () => {
    expect(
      asAnchorLink({
        id: 'formula-1',
        kind: 'cloze',
        locator: createFormulaLocator()
      }, 'anchorLink')
    ).toEqual({
      id: 'formula-1',
      kind: 'cloze',
      locator: createFormulaLocator()
    });
  });
});

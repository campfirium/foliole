import { expect, it } from 'vitest';

import {
  parseCssLength,
  resolveDocumentHeaderCompactMode
} from './documentPanelHeaderCompact';

it('keeps document header side controls outside until the content rail reaches the side safe area', () => {
  expect(resolveDocumentHeaderCompactMode({
    containerWidth: 960,
    documentMaxWidth: 760,
    sideSafeInlineStart: 80
  })).toBe(false);

  expect(resolveDocumentHeaderCompactMode({
    containerWidth: 920,
    documentMaxWidth: 760,
    sideSafeInlineStart: 80
  })).toBe(true);
});

it('parses rem safe-area values against the root font size', () => {
  document.documentElement.style.fontSize = '16px';

  expect(parseCssLength('5rem', 0)).toBe(80);
  expect(parseCssLength('', 72)).toBe(72);
});

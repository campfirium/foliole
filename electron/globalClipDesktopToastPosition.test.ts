import { expect, it } from 'vitest';

import { resolveGlobalClipToastPoint } from './globalClipDesktopToastPosition.js';

const base = {
  gutter: 22,
  margin: 18,
  toastHeight: 72,
  toastWidth: 340,
  workArea: { height: 900, width: 1400, x: 120, y: 40 }
};

it('positions the capture confirmation at the selected edge of the current display', () => {
  expect(resolveGlobalClipToastPoint({ ...base, position: 'top-right' })).toEqual({
    x: 1140,
    y: 36
  });
  expect(resolveGlobalClipToastPoint({ ...base, position: 'bottom-right' })).toEqual({
    x: 1140,
    y: 828
  });
});

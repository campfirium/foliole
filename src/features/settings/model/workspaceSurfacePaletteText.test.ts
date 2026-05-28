import { describe, expect, it } from 'vitest';

import { parseWorkspaceSurfacePaletteText } from './workspaceSurfacePaletteText';

describe('parseWorkspaceSurfacePaletteText', () => {
  it('parses five comma-separated hex colors', () => {
    expect(parseWorkspaceSurfacePaletteText('#ffffff, fcfcfc, #f6f6f6, F5F5F3, #ececea')).toEqual([
      '#ffffff',
      '#fcfcfc',
      '#f6f6f6',
      '#f5f5f3',
      '#ececea'
    ]);
  });

  it('rejects invalid or incomplete palette text', () => {
    expect(parseWorkspaceSurfacePaletteText('#ffffff, #fcfcfc, #f6f6f6, #f5f5f3')).toBeNull();
    expect(parseWorkspaceSurfacePaletteText('#ffffff, #fcfcfc, #f6f6f6, #f5f5f3, tomato')).toBeNull();
  });
});

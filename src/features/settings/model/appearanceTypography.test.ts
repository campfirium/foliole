import { describe, expect, it } from 'vitest';

import { applyEditorTypographyScale } from './appearanceTypography';

describe('applyEditorTypographyScale', () => {
  it('keeps markdown code close enough to the body size for Chinese inline code', () => {
    const root = document.createElement('div');

    applyEditorTypographyScale(root, 17);

    expect(root.style.getPropertyValue('--content-panel-code-font-size')).toBe('15.3px');
  });
});

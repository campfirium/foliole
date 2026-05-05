import { describe, expect, it } from 'vitest';

import { resolveNodeRowButtonClassName } from './NodeTreeRowStyle';

describe('resolveNodeRowButtonClassName', () => {
  it('keeps top-level ordinary rows bold', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isDerived: false,
      isSelected: false
    });

    expect(className).toContain('font-bold');
    expect(className).not.toContain('font-normal');
  });

  it('renders non-top-level ordinary rows with normal weight', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 1,
      isDerived: false,
      isSelected: false
    });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('renders derived rows with normal weight even at the top level', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isDerived: true,
      isSelected: false
    });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });
});

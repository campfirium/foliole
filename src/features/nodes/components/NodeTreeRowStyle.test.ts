import { describe, expect, it } from 'vitest';

import { resolveNodeRowButtonClassName } from './NodeTreeRowStyle';

function resolveDefaultNodeRowButtonClassName(
  overrides: Partial<Parameters<typeof resolveNodeRowButtonClassName>[0]>
) {
  return resolveNodeRowButtonClassName({
    depth: 0,
    isBulkSelectionActive: false,
    isDerived: false,
    isHighlighted: false,
    isSelected: false,
    ...overrides
  });
}

describe('resolveNodeRowButtonClassName', () => {
  it('renders top-level ordinary rows with normal weight', () => {
    const className = resolveDefaultNodeRowButtonClassName({ depth: 0 });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('renders non-top-level ordinary rows with normal weight', () => {
    const className = resolveDefaultNodeRowButtonClassName({ depth: 1 });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('renders derived rows with normal weight even at the top level', () => {
    const className = resolveDefaultNodeRowButtonClassName({ isDerived: true });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('keeps the original calm background for selected rows', () => {
    const className = resolveDefaultNodeRowButtonClassName({ isSelected: true });

    expect(className).toContain('before:top-0.5');
    expect(className).toContain('before:bottom-0.5');
    expect(className).toContain('before:bg-foreground/[0.05]');
    expect(className).not.toContain(' bg-foreground/[0.05]');
    expect(className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
  });

  it('keeps bulk selection from changing row spacing', () => {
    const className = resolveDefaultNodeRowButtonClassName({
      isBulkSelectionActive: true,
      isSelected: true
    });

    expect(className).not.toContain('my-0.5');
    expect(className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
  });
});

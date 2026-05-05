import { describe, expect, it } from 'vitest';

import { resolveNodeRowButtonClassName } from './NodeTreeRowStyle';

describe('resolveNodeRowButtonClassName', () => {
  it('renders top-level ordinary rows with normal weight', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isBulkSelectionActive: false,
      isDerived: false,
      isSelected: false
    });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('renders non-top-level ordinary rows with normal weight', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 1,
      isBulkSelectionActive: false,
      isDerived: false,
      isSelected: false
    });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('renders derived rows with normal weight even at the top level', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isBulkSelectionActive: false,
      isDerived: true,
      isSelected: false
    });

    expect(className).toContain('font-normal');
    expect(className).not.toContain('font-bold');
  });

  it('keeps the original calm background for selected rows', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isBulkSelectionActive: false,
      isDerived: false,
      isSelected: true
    });

    expect(className).toContain('bg-foreground/[0.05]');
    expect(className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
  });

  it('adds row separation only while bulk selection is active', () => {
    const className = resolveNodeRowButtonClassName({
      depth: 0,
      isBulkSelectionActive: true,
      isDerived: false,
      isSelected: true
    });

    expect(className).toContain('my-0.5');
    expect(className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
  });
});

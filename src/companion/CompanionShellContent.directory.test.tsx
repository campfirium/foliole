import { describe, expect, it, vi } from 'vitest';

import { resolveCompanionTopBarProps } from './CompanionShellContent';

function createSurface() {
  return {
    activeAction: 'recent',
    handleTabAction: vi.fn()
  } as never;
}

describe('CompanionShellContent directory navigation', () => {
  it('keeps the directory root as a top-level directory surface', () => {
    const root = resolveCompanionTopBarProps(
      createSurface(),
      'list',
      true,
      false,
      { kind: 'root' },
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn()
    );

    expect(root).toEqual({});
  });

  it('returns nested directory pages to their parent', () => {
    const onCloseBrowseDirectory = vi.fn();
    const onResetDirectorySelection = vi.fn();
    const onBackDirectorySelection = vi.fn();

    const nested = resolveCompanionTopBarProps(
      createSurface(),
      'list',
      true,
      false,
      { folderId: 'external-1', kind: 'externalFolder' },
      vi.fn(),
      onCloseBrowseDirectory,
      onResetDirectorySelection,
      onBackDirectorySelection,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn()
    );
    nested.onBack?.();

    expect(nested.backLabel).toBe('Back');
    expect(onBackDirectorySelection).toHaveBeenCalledTimes(1);
    expect(onResetDirectorySelection).not.toHaveBeenCalled();
    expect(onCloseBrowseDirectory).not.toHaveBeenCalled();
  });
});

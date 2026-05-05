import { describe, expect, it, vi } from 'vitest';

import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';

function createSurface() {
  return {
    activeAction: 'recent',
    handleTabAction: vi.fn()
  } as never;
}

function createTopBarProps(args: {
  directorySelection: Parameters<typeof resolveCompanionTopBarProps>[4];
  onBackDirectorySelection?: () => void;
}) {
  return resolveCompanionTopBarProps(
    createSurface(),
    'list',
    true,
    false,
    args.directorySelection,
    'lastOpenedAt',
    'desc',
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    false,
    undefined,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    args.onBackDirectorySelection ?? vi.fn()
  );
}

describe('CompanionShellContent directory navigation', () => {
  it('keeps the directory root as a top-level directory surface', () => {
    const root = createTopBarProps({ directorySelection: { kind: 'root' } });

    expect(root.onBack).toBeUndefined();
    expect(root.rightSlot).toBeTruthy();
  });

  it('returns nested directory pages to their parent', () => {
    const onBackDirectorySelection = vi.fn();

    const nested = createTopBarProps({
      directorySelection: { folderId: 'external-1', kind: 'externalFolder' },
      onBackDirectorySelection
    });
    nested.onBack?.();

    expect(nested.backLabel).toBe('Back');
    expect(onBackDirectorySelection).toHaveBeenCalledTimes(1);
  });
});

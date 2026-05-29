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
    'dateLastOpened',
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

    expect('onBack' in root ? root.onBack : undefined).toBeUndefined();
    expect('rightSlot' in root ? root.rightSlot : null).toBeTruthy();
  });

  it('returns nested directory pages to their parent', () => {
    const onBackDirectorySelection = vi.fn();

    const nested = createTopBarProps({
      directorySelection: { folderId: 'external-1', kind: 'externalFolder' },
      onBackDirectorySelection
    });
    const onBack = 'onBack' in nested && typeof nested.onBack === 'function' ? nested.onBack : undefined;
    if (onBack) {
      onBack();
    }

    expect('backLabel' in nested ? nested.backLabel : undefined).toBe('Back');
    expect(onBackDirectorySelection).toHaveBeenCalledTimes(1);
  });
});

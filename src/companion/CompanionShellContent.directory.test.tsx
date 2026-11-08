import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { VIRTUAL_SHELVED_NODE_ID } from '../../lib/core/database/specialNodeIds';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

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
    (key, params) => translate('en', key, params),
    createSurface(),
    'list',
    true,
    args.directorySelection,
    'dateLastOpened',
    'desc',
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
    args.onBackDirectorySelection ?? vi.fn(),
    vi.fn()
  );
}

describe('CompanionShellContent directory navigation', () => {
  it('keeps the directory root as a top-level directory surface', () => {
    const root = createTopBarProps({ directorySelection: { kind: 'root' } });

    expect('onBack' in root ? root.onBack : undefined).toBeUndefined();
    expect('rightSlot' in root ? root.rightSlot : null).toBeTruthy();
  });

  it('keeps both focus actions unavailable while browsing Shelved', () => {
    const topBar = createTopBarProps({ directorySelection: { kind: 'virtual', nodeId: VIRTUAL_SHELVED_NODE_ID } });
    renderWithLocalization(<>{'rightSlot' in topBar ? topBar.rightSlot : null}</>);
    expect(screen.getByRole('button', { name: 'Hide dismissed and shelved topics' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hide dismissed and shelved topics' })).toBeDisabled();
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

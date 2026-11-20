import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../lib/core/database/specialNodeIds';
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

  it.each([
    ['Shelved', { kind: 'virtual', nodeId: VIRTUAL_SHELVED_NODE_ID }],
    ['Published', { kind: 'virtual', nodeId: VIRTUAL_PUBLISHED_NODE_ID }],
    ['Trash', { kind: 'trash' }]
  ] as const)('leaves the topic focus action out of %s, where it has nothing to hide', (_name, directorySelection) => {
    const topBar = createTopBarProps({ directorySelection });
    renderWithLocalization(<>{'rightSlot' in topBar ? topBar.rightSlot : null}</>);
    expect(screen.queryByRole('button', { name: 'Hide dismissed and shelved topics' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^More$/ }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Hide dismissed and shelved topics' })).not.toBeInTheDocument();
  });

  it('keeps the topic focus action in an ordinary folder', () => {
    const topBar = createTopBarProps({ directorySelection: { kind: 'internal', nodeId: 'folder' } });
    renderWithLocalization(<>{'rightSlot' in topBar ? topBar.rightSlot : null}</>);
    expect(screen.getByRole('button', { name: 'Hide dismissed and shelved topics' })).toBeEnabled();
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

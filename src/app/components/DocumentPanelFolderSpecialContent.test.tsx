import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { setSystemEntryDisplayNames } from '../../shared/localization/systemEntryDisplayNamesStore';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { renderFolderSpecialContent } from './DocumentPanelFolderSpecialContent';

it('shows a system folder alias without changing the stored node title', () => {
  const home: Node = {
    content: '',
    createdAt: '2026-08-22T00:00:00.000Z',
    id: 'special-home',
    kind: 'folder',
    parentNodeId: null,
    reveal: null,
    review: null,
    title: 'Home',
    updatedAt: '2026-08-22T00:00:00.000Z'
  };
  setSystemEntryDisplayNames({ customDisplayNameById: { home: 'Library door' }, version: 1 });

  renderWithLocalization(
    <MouseGestureSettingsProvider>
      {renderFolderSpecialContent({
        activeNode: home,
        activeNodeId: home.id,
        folderListSortDirection: 'asc',
        folderListSortKey: 'name',
        nodeOrder: [],
        nodesById: { [home.id]: home },
        onChangeFolderListSortDirection: vi.fn(),
        onChangeFolderListSortKey: vi.fn(),
        onSelectNode: vi.fn(),
        pdfCache: <></>,
        trashedNodeIds: []
      })}
    </MouseGestureSettingsProvider>
  );

  expect(screen.getByRole('heading', { name: 'Library door' })).toBeVisible();
  expect(home.title).toBe('Home');
});

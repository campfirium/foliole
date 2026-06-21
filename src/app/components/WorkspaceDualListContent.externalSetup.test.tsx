import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

it('opens a simplified external folder setup dialog before connecting a folder', () => {
  const onOpenExternalLibrarySettings = vi.fn();
  const onOpenExternalSelection = vi.fn();

  renderWorkspaceContent({
    isExternalViewOpen: true,
    onOpenExternalLibrarySettings,
    onOpenExternalSelection
  });

  const setupRow = screen.getByRole('treeitem', { name: 'External Folder' });
  expect(setupRow).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('dialog', { name: 'Connect an external folder' })).toBeNull();

  fireEvent.click(setupRow);
  expect(onOpenExternalSelection).toHaveBeenCalledWith({ kind: 'root' });
  expect(onOpenExternalLibrarySettings).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Connect an external folder' })).toBeInTheDocument();
  expect(screen.getByText('External Folder is simplified in this demo. The desktop app includes the full experience: it keeps connected folders as an external document library for search, preview, and import, while original files stay outside Foliole.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Connect folder' }));

  expect(onOpenExternalLibrarySettings).toHaveBeenCalledTimes(1);
});

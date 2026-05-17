import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';

const node = {
  id: 'node-2',
  parentNodeId: null,
  title: 'Atlas topic',
  hasContent: true,
  hasReveal: false,
  review: null,
  createdAt: '2026-03-29T00:00:00.000Z',
  updatedAt: '2026-03-29T00:00:00.000Z'
};

function renderPalette(isOpen = true) {
  return render(
    <SearchPalette
      isOpen={isOpen}
      nodeOrder={['node-2']}
      nodesById={{ 'node-2': node }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue([]));
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
});

it('persists the collapsed search shortcut footer preference', () => {
  const { unmount } = renderPalette();

  expect(screen.getByText('Open')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse search shortcuts' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchPaletteShortcutsCollapsed)).toBe('true');
  expect(screen.queryByText('Open')).not.toBeInTheDocument();
  expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument();

  unmount();
  renderPalette();

  expect(screen.queryByText('Open')).not.toBeInTheDocument();
  expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show search shortcuts' })).toBeInTheDocument();
});

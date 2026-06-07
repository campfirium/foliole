import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { SearchPalette } from '../app/components/SearchPalette';
import { SearchResultPreviewPanel } from '../app/components/SearchResultPreviewPanel';
import type { WorkspaceSearchResult } from '../app/components/workspaceSearch';
import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import type { ElectronAPI } from '../shared/platform/electronApi';

import { createSmokeRuntimeInvoke } from './app-smoke.shared';

function createExternalSearchRuntimeInvoke() {
  const baseInvoke = createSmokeRuntimeInvoke();
  return vi.fn().mockImplementation((command: string, args?: { absolute_path?: string; query?: string }) => {
    if (command === 'search_workspace') {
      expect(args).toEqual({ query: 'Atlas' });
      return Promise.resolve([
        {
          externalMatch: {
            absolutePath: '/library/atlas.md',
            folderId: 'folder-1',
            folderPath: '/library',
            query: 'Atlas',
            relativePath: 'atlas.md'
          },
          excerpt: 'Atlas launch notes from the external library.',
          id: '/library/atlas.md',
          kind: 'external',
          nodeMatch: null,
          pdfMatch: null,
          title: 'Atlas External'
        }
      ]);
    }
    if (command === 'load_external_search_preview') {
      expect(args).toEqual({ absolute_path: '/library/atlas.md' });
      return Promise.resolve({
        absolute_path: '/library/atlas.md',
        content: '# Atlas external preview',
        extension: 'md',
        file_name: 'atlas.md',
        folder_id: 'folder-1',
        folder_path: '/library',
        relative_path: 'atlas.md'
      });
    }
    return baseInvoke(command, args);
  });
}

function ExternalSearchPreviewSmoke({ nodesById }: { nodesById: Record<string, never> }) {
  const [previewResult, setPreviewResult] = useState<WorkspaceSearchResult | null>(null);
  return (
    <AppearanceSettingsProvider>
      <SearchPalette
        isOpen={!previewResult}
        nodeOrder={[]}
        nodesById={nodesById}
        onClose={() => undefined}
        onOpenResult={(result, options) => {
          if (options?.preview) {
            setPreviewResult(result);
          }
        }}
        trashedNodeIds={[]}
      />
      <SearchResultPreviewPanel
        nodesById={nodesById}
        onClose={() => setPreviewResult(null)}
        onOpenResult={() => undefined}
        result={previewResult}
      />
    </AppearanceSettingsProvider>
  );
}

it('opens external search hits in the popup preview panel instead of the workspace body surface', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  const invoke = createExternalSearchRuntimeInvoke();
  window.electronAPI = {
    invoke: invoke as ElectronAPI['invoke'],
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<ExternalSearchPreviewSmoke nodesById={{}} />);

  const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
  const input = within(dialog).getByLabelText('Search workspace');

  fireEvent.change(input, { target: { value: 'Atlas' } });

  const resultButton = await within(dialog).findByRole('button', { name: /Atlas External/i });
  fireEvent.click(resultButton, { shiftKey: true });

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Search result preview' })).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByDisplayValue('# Atlas external preview')).toBeInTheDocument();
  });
  expect(screen.queryByRole('dialog', { name: 'Workspace search' })).not.toBeInTheDocument();
});

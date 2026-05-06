import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import './app-smoke.shared';

import { App } from '../app/App';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

function createExternalSearchRuntimeInvoke() {
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
    return Promise.resolve(null);
  });
}

it('opens external search hits in the popup preview panel instead of the workspace body surface', async () => {
  const invoke = createExternalSearchRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
  const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
  const input = within(dialog).getByLabelText('Search workspace');

  fireEvent.change(input, { target: { value: 'Atlas' } });

  const resultButton = await within(dialog).findByRole('button', { name: /Atlas External/i });
  fireEvent.click(resultButton);

  await waitFor(() => {
    expect(screen.getByLabelText('External document preview panel')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByDisplayValue('# Atlas external preview')).toBeInTheDocument();
  });
  expect(screen.queryByRole('dialog', { name: 'Workspace search' })).not.toBeInTheDocument();
});

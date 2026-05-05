import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { applyReadwiseRootPath, createReadwiseImportSources } from './importSourceWorkspaceModel';

vi.mock('../../shared/platform/importBridge', () => ({
  selectRuntimeImportDirectory: vi.fn(async () => '/tmp/chosen-folder')
}));

function createMockElectronApi() {
  let persistedSettings: Record<string, unknown> | null = null;
  return {
    invoke: vi.fn(async (command: string, args?: { settings?: Record<string, unknown> }) => {
      if (command === 'load_import_manager_settings') {
        return persistedSettings;
      }
      if (command === 'save_import_manager_settings') {
        persistedSettings = args?.settings ?? null;
        return persistedSettings;
      }
      if (command === 'inspect_readwise_reader_setup') {
        return {
          checkedSourceCount: 1,
          matchedHighlightCount: 2,
          message: 'Checked 1 article sample successfully.',
          sampleCount: 2,
          samples: [
            {
              excerpt: 'This is the highlighted sentence inside the article body.',
              highlightText: 'highlighted sentence',
              matched: true,
              sourceName: 'Sample Article'
            },
            {
              excerpt: 'Another matching excerpt from the article body.',
              highlightText: 'matching excerpt',
              matched: true,
              sourceName: 'Sample Article'
            }
          ],
          success: true
        };
      }
      return null;
    }),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  window.electronAPI = createMockElectronApi();
});

it('shows readwise defaults for the four readwise source groups', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Readwise Reader for Obsidian' })).toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-1')).toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-2')).toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-3')).toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-4')).toBeInTheDocument();
  expect(screen.getByLabelText('Trigger draft-import-source-101')).toBeInTheDocument();

  const triggerSelect = screen.getByLabelText('Trigger draft-import-source-1');
  const handlingSelect = screen.getByLabelText('Handling draft-import-source-1');

  expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument();
  expect(triggerSelect).toHaveValue('scheduled');
  expect(handlingSelect).toHaveValue('keep');
  expect(screen.getByLabelText('Mode draft-import-source-1')).toHaveValue('split');
  expect(screen.getByLabelText('Every draft-import-source-1')).toHaveValue('5 min');
  expect(screen.getByRole('button', { name: 'Import draft-import-source-1' })).toBeInTheDocument();

  fireEvent.change(handlingSelect, { target: { value: 'move' } });
  expect(await screen.findByDisplayValue('Move')).toBeInTheDocument();

  fireEvent.change(triggerSelect, { target: { value: 'manual' } });
  expect(triggerSelect).toHaveValue('manual');

  fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
  expect(screen.queryByText('Books')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Detailed settings' })).toBeInTheDocument();
  expect(screen.getByLabelText('Trigger draft-import-source-101')).toBeInTheDocument();
});

it('lets the user reopen the readwise advanced settings', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
  expect(screen.getByRole('button', { name: 'Detailed settings' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Detailed settings' }));
  expect(screen.getByLabelText('Readwise original folder draft-import-source-1')).toBeInTheDocument();
  expect(screen.getByLabelText('Trigger draft-import-source-1')).toHaveValue('scheduled');
});

it('fills readwise folders from the selected root path', () => {
  const sources = createReadwiseImportSources();
  const updated = applyReadwiseRootPath(sources, '/tmp/chosen-folder');

  expect(updated[0].primaryPath).toBe('/tmp/chosen-folder/Full Document Contents/Articles');
  expect(updated[0].highlightPath).toBe('/tmp/chosen-folder/Articles');
  expect(updated[3].primaryPath).toBe('/tmp/chosen-folder/Full Document Contents/Podcasts');
  expect(updated[3].highlightPath).toBe('/tmp/chosen-folder/Podcasts');
});

it('keeps readwise auto-filled paths platform aware', () => {
  const sources = createReadwiseImportSources();
  const updated = applyReadwiseRootPath(sources, 'D:\\Dropbox\\obs\\clip\\');

  expect(updated[0].primaryPath).toBe('D:\\Dropbox\\obs\\clip\\Full Document Contents\\Articles');
  expect(updated[0].highlightPath).toBe('D:\\Dropbox\\obs\\clip\\Articles');
});

it('shows only the last folder name and keeps the full path in the hover hint', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Readwise root folder'));
  fireEvent.click(screen.getByLabelText('Original folder draft-import-source-101'));

  await waitFor(() => {
    expect(screen.getByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  });
  expect(screen.queryByText('/tmp/chosen-folder')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByLabelText('Readwise original folder draft-import-source-1')).toHaveTextContent('Articles');
  });
  expect(screen.queryByText('/tmp/chosen-folder/Full Document Contents/Articles')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-1')).toHaveAttribute(
    'title',
    '/tmp/chosen-folder/Full Document Contents/Articles'
  );
  expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveAttribute('title', '/tmp/chosen-folder');
});

it('persists import manager settings after the panel remounts', async () => {
  const { unmount } = render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Readwise root folder'));
  fireEvent.change(screen.getByLabelText('Trigger draft-import-source-1'), { target: { value: 'manual' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy draft-import-source-101' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenLastCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          detailsOpen: false,
          readwiseRootPath: '/tmp/chosen-folder'
        })
      })
    );
  });

  unmount();
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(await screen.findByRole('button', { name: 'Detailed settings' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Detailed settings' }));
  expect(await screen.findByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  expect(screen.getByLabelText('Trigger draft-import-source-1')).toHaveValue('manual');
  expect(screen.getByLabelText('Original folder draft-import-source-103')).toBeInTheDocument();
});

it('blocks the readwise settings entry until the root folder is chosen', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));

  expect(screen.getByText('Choose the Readwise root folder first, then open the Readwise settings.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Readwise Reader settings' })).not.toBeInTheDocument();
});

it('requires detection and confirmation before saving the readwise reader setup', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Readwise root folder'));
  await waitFor(() => {
    expect(screen.getByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));

  expect(await screen.findByRole('heading', { name: 'Readwise Reader settings' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Detect' }));
  expect(await screen.findByText('Checked 1 article sample successfully.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          readwiseReaderConfig: expect.objectContaining({
            highlightSeparator: '\\n\\n',
            validatedAt: expect.any(String)
          }),
          readwiseRootPath: '/tmp/chosen-folder'
        })
      })
    );
  });

  expect(screen.getByText('Configured')).toBeInTheDocument();
});

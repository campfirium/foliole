import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { applyReadwiseRootPath, createReadwiseImportSources } from './importSourceWorkspaceModel';

vi.mock('../../shared/platform/importBridge', () => ({
  previewRuntimeKeepImportRule: vi.fn(async ({ directoryPath, ruleId }: { directoryPath: string; ruleId: string }) => ({
    blockedCount: 1,
    discoveredCount: 3,
    entries: [
      { detail: 'New file will be imported when enabled.', sourcePath: 'new.md', status: 'new' },
      { detail: 'No file changes detected since the last keep scan.', sourcePath: 'same.md', status: 'unchanged' },
      { detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.', sourcePath: 'blocked.md', status: 'blocked_deleted' }
    ],
    failedCount: 0,
    newCount: 1,
    previewedAt: '2026-03-25T00:03:00.000Z',
    rootPath: directoryPath,
    rule_id: ruleId,
    unchangedCount: 1,
    updatedCount: 1
  })),
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
          detectedHighlightCount: 2,
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

it('shows the generic handling selector without restoring trigger controls', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Readwise Reader for Obsidian settings' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Readwise Reader settings' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Trigger draft-import-source-1')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Handling draft-import-source-101')).toBeInTheDocument();
  expect(screen.queryByLabelText('Every draft-import-source-1')).not.toBeInTheDocument();
  expect(screen.queryByText('Enable')).not.toBeInTheDocument();
  expect(screen.queryByText('Status')).not.toBeInTheDocument();
  expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preview draft-import-source-101' })).toBeDisabled();
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

it('opens a preview dialog and only enables after confirmation', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Original folder draft-import-source-101'));
  await waitFor(() => {
    expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveTextContent('chosen-folder');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview draft-import-source-101' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Preview keep import' })).toBeInTheDocument();
  });
  expect(screen.getByText('1 new · 1 updated · 1 unchanged · 1 blocked')).toBeInTheDocument();
  expect(screen.getByText('blocked.md')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenLastCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({
              id: 'draft-import-source-101',
              keepPreview: expect.objectContaining({
                blockedCount: 1,
                discoveredCount: 3,
                newCount: 1
              }),
              keepState: 'enabled',
              primaryPath: '/tmp/chosen-folder'
            })
          ])
        })
      })
    );
  });

  expect(screen.getByRole('switch', { name: 'Keep import enabled draft-import-source-101' })).toHaveAttribute('aria-checked', 'true');
});

it('persists import manager settings after the panel remounts', async () => {
  const { unmount } = render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Original folder draft-import-source-101'));
  await waitFor(() => {
    expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveTextContent('chosen-folder');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview draft-import-source-101' }));
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Preview keep import' })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy draft-import-source-101' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenLastCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({
              id: 'draft-import-source-101',
              keepState: 'enabled',
              primaryPath: '/tmp/chosen-folder'
            })
          ])
        })
      })
    );
  });

  unmount();
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(await screen.findByLabelText('Original folder draft-import-source-101')).toHaveTextContent('chosen-folder');
  expect(screen.getByRole('switch', { name: 'Keep import enabled draft-import-source-101' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByLabelText('Original folder draft-import-source-103')).toBeInTheDocument();
});

it('stores the move destination for a generic source and restores it after remount', async () => {
  const { unmount } = render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.change(screen.getByLabelText('Handling draft-import-source-101'), { target: { value: 'move' } });

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenLastCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({
              actionMode: 'move',
              archivePath: '/tmp/chosen-folder',
              id: 'draft-import-source-101'
            })
          ])
        })
      })
    );
  });

  expect(screen.getByLabelText('Handling draft-import-source-101')).toHaveValue('move');
  expect(screen.getByLabelText('Handling draft-import-source-101')).toHaveAttribute('title', '/tmp/chosen-folder');

  unmount();
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(await screen.findByLabelText('Handling draft-import-source-101')).toHaveValue('move');
  expect(screen.getByLabelText('Handling draft-import-source-101')).toHaveAttribute('title', '/tmp/chosen-folder');
});

it('asks for confirmation before turning an enabled keep import off', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByLabelText('Original folder draft-import-source-101'));
  await waitFor(() => {
    expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveTextContent('chosen-folder');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview draft-import-source-101' }));
  expect(await screen.findByRole('heading', { name: 'Preview keep import' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

  const toggle = await screen.findByRole('switch', { name: 'Keep import enabled draft-import-source-101' });
  fireEvent.click(toggle);
  expect(await screen.findByRole('heading', { name: 'Turn off keep import' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenLastCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({
              id: 'draft-import-source-101',
              keepState: 'previewed'
            })
          ])
        })
      })
    );
  });

  expect(screen.getByRole('button', { name: 'Preview draft-import-source-101' })).toBeInTheDocument();
});

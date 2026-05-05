import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

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
          detectedHighlightCount: 4,
          matchedHighlightCount: 2,
          message: 'Checked 1 article sample successfully.',
          sampleCount: 3,
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
            },
            {
              excerpt: 'Closing thought from the article body.',
              highlightText: 'missing excerpt',
              matched: false,
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

it('shows only the last folder name and keeps the full path in the hover hint', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));
  expect(await screen.findByRole('heading', { name: 'Readwise Reader settings' })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Readwise root folder'));
  fireEvent.click(screen.getByLabelText('Original folder draft-import-source-101'));

  await waitFor(() => {
    expect(screen.getByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  });
  expect(screen.getAllByLabelText('Readwise original folder draft-import-source-1')[0]).toHaveTextContent('Articles');
  expect(screen.getByLabelText('Readwise root folder')).toHaveAttribute('title', '/tmp/chosen-folder');
  expect(screen.getAllByLabelText('Readwise original folder draft-import-source-1')[0]).toHaveAttribute(
    'title',
    '/tmp/chosen-folder/Full Document Contents/Articles'
  );
  expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveAttribute('title', '/tmp/chosen-folder');
});

it('opens the readwise settings panel with all parser fields and keeps preview disabled until folders exist', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));

  expect(await screen.findByRole('heading', { name: 'Readwise Reader settings' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('## Highlights')).toBeInTheDocument();
  expect(screen.getByDisplayValue('## New highlights added')).toBeInTheDocument();
  expect(screen.getByDisplayValue('\\n\\n')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Tags:')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Note:')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
});

it('shows the readwise folders in a compact content and highlights matrix', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));

  expect(await screen.findByRole('heading', { name: 'Readwise Reader settings' })).toBeInTheDocument();
  expect(screen.getAllByText('Content').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Highlights').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Articles').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Books').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Tweets').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Podcasts').length).toBeGreaterThan(0);
});

it('saves the readwise reader setup only after preview and enable', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Readwise Reader settings' }));

  expect(await screen.findByRole('heading', { name: 'Readwise Reader settings' })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Readwise root folder'));
  await waitFor(() => {
    expect(screen.getByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  });
  expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(await screen.findByRole('heading', { name: 'Readwise preview' })).toBeInTheDocument();
  expect(await screen.findByText('Checked 1 article sample successfully.')).toBeInTheDocument();
  expect(screen.getAllByText('Sample Article')).toHaveLength(1);
  expect(screen.getByText('highlighted sentence', { selector: 'mark' })).toBeInTheDocument();
  expect(screen.getByText('...')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

  await waitFor(() => {
    expect(window.electronAPI?.invoke).toHaveBeenCalledWith(
      'save_import_manager_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          readwiseReaderConfig: expect.objectContaining({
            highlightsHeading: '## Highlights',
            highlightSeparator: '\\n\\n',
            newHighlightsHeading: '## New highlights added',
            noteKeyword: 'Note:',
            tagKeyword: 'Tags:',
            validatedAt: expect.any(String)
          }),
          readwiseRootPath: '/tmp/chosen-folder',
          readwiseSources: expect.arrayContaining([
            expect.objectContaining({
              id: 'draft-import-source-1',
              keepState: 'enabled',
              primaryPath: '/tmp/chosen-folder/Full Document Contents/Articles',
              highlightPath: '/tmp/chosen-folder/Articles'
            })
          ])
        })
      })
    );
  });

  expect(screen.getByText('Configured')).toBeInTheDocument();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ExternalSearchPreviewDialog } from './ExternalSearchPreviewDialog';

const loadRuntimeExternalSearchPreview = vi.fn();

vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  importRuntimeExternalSearchDocument: vi.fn(),
  loadRuntimeExternalSearchPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <div>{props.value}</div>
}));

beforeEach(() => {
  loadRuntimeExternalSearchPreview.mockReset();
});

it('shows a loading state while the external search preview loads', () => {
  loadRuntimeExternalSearchPreview.mockReturnValueOnce(new Promise(() => undefined));

  render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);

  expect(screen.getByText('Loading external preview')).toBeInTheDocument();
});

it('shows a retryable error when the external search preview fails', async () => {
  loadRuntimeExternalSearchPreview
    .mockRejectedValueOnce(new Error('Preview failed.'))
    .mockResolvedValueOnce({
      absolutePath: '/library/topic.md',
      content: '# Preview',
      extension: 'md',
      fileName: 'topic.md',
      folderId: 'folder-1',
      folderPath: '/library',
      relativePath: 'topic.md'
    });

  render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Preview failed.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('# Preview')).toBeInTheDocument();
  });
});

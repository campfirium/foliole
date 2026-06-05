import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { createReadwiseImportPreview } from './readwiseReaderSettingsTestSupport';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';

const { openLocalPath } = vi.hoisted(() => ({ openLocalPath: vi.fn() }));

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openLocalPath
}));

function createSpecialReadwiseImportPreview() {
  const preview = createReadwiseImportPreview();
  preview.entries = [
    {
      destination: 'inbox',
      detail: null,
      detected_highlight_count: 1,
      highlight_status: 'with_highlights',
      highlight_type: 'with_highlights',
      open_path: '/Readwise/Articles/Ready.md',
      source_kind: 'articles',
      source_path: 'Ready.md',
      status: 'new'
    },
    {
      destination: 'inbox',
      detail: 'Highlight file was found, but no highlights matched the current parser settings.',
      detected_highlight_count: 0,
      highlight_status: 'unparsed',
      highlight_type: 'with_highlights',
      open_path: '/Readwise/Articles/Unparsed.md',
      source_kind: 'articles',
      source_path: 'Unparsed.md',
      status: 'new'
    },
    {
      destination: 'inbox',
      detail: 'Highlight file was found without a matching full document source file.',
      detected_highlight_count: 1,
      highlight_status: 'highlight_only',
      highlight_type: 'with_highlights',
      open_path: '/Readwise/Articles/HighlightOnly.md',
      source_kind: 'articles',
      source_path: 'HighlightOnly.md',
      status: 'new'
    },
    {
      destination: 'off',
      detail: 'Skipped by current import behavior.',
      detected_highlight_count: 0,
      highlight_status: 'without_highlights',
      highlight_type: 'without_highlights',
      open_path: '/Readwise/Articles/Plain.md',
      source_kind: 'articles',
      source_path: 'Plain.md',
      status: 'off'
    }
  ];
  preview.total_count = 4;
  preview.with_highlights_count = 3;
  return preview;
}

it('changes the start action label while showing progress feedback', () => {
  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={false}
      isPreviewing={false}
      isStarting={true}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={null}
      preview={createReadwiseImportPreview()}
    />
  );

  expect(screen.getByRole('heading', { name: 'Readwise import' })).toBeInTheDocument();
  const startButton = screen.getByRole('button', { name: 'Importing' });
  expect(startButton).toBeDisabled();
  expect(startButton.querySelector('.animate-spin')).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border-[var(--app-control-border-color)]');
  expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Readwise import progress' })).toBeInTheDocument();
  expect(screen.getByText('Preparing Readwise import')).toBeInTheDocument();
});

it('shows the active Readwise import stage in the preview dialog', () => {
  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={false}
      isPreviewing={false}
      isStarting={true}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={{
        indexElapsedMs: 1400,
        indexFailedCount: 0,
        indexPendingCount: 4,
        indexProcessedCount: 6,
        indexTotalCount: 10,
        phase: 'indexing',
        processedCount: 1,
        sourceProcessedCount: 41,
        sourceTotalCount: 200,
        status: 'running',
        totalCount: 2
      }}
      preview={createReadwiseImportPreview()}
    />
  );

  expect(screen.getByText('Indexing')).toBeInTheDocument();
  expect(screen.getByText('21%')).toBeInTheDocument();
  expect(screen.queryByText(/pending/u)).not.toBeInTheDocument();
  expect(screen.queryByText(/41\/200/u)).not.toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Readwise import progress' })).toHaveAttribute(
    'aria-valuenow',
    '21'
  );
});

it('keeps long source topic names on one truncated row beside the percent', () => {
  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={false}
      isPreviewing={false}
      isStarting={true}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={{
        indexElapsedMs: 0,
        indexFailedCount: 0,
        indexPendingCount: 0,
        indexProcessedCount: 0,
        indexTotalCount: 0,
        phase: 'writing',
        processedCount: 1,
        sourceProcessedCount: 9,
        sourceTotalCount: 100,
        status: 'running',
        totalCount: 1,
        currentSourcePath:
          '/readwise/export/a-very-long-source-topic-name-that-must-not-push-the-percent-column-away.md'
      }}
      preview={createReadwiseImportPreview()}
    />
  );

  const status = screen.getByText(
    'Importing a-very-long-source-topic-name-that-must-not-push-the-percent-column-away.md'
  );
  expect(status).toHaveClass('truncate');
  expect(screen.getByText('9%')).toHaveClass('shrink-0');
});

it('uses Readwise import preview before execution starts', () => {
  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={false}
      isPreviewing={false}
      isStarting={false}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={null}
      preview={createReadwiseImportPreview()}
    />
  );

  expect(screen.getByText('1 ready to import.')).toBeInTheDocument();
  expect(screen.getByText('Sample source topic.md')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('border-transparent');
});

it('places unparsed Readwise entries first and opens their highlight file from the name', () => {
  openLocalPath.mockReset();
  const preview = createSpecialReadwiseImportPreview();

  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={false}
      isPreviewing={false}
      isStarting={false}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={null}
      preview={preview}
    />
  );

  expect(screen.getByText('3 ready to import (1 highlight-only, 1 unparsed), 1 skipped.')).toBeInTheDocument();
  const rows = screen.getAllByText(/\.md$/u).map((node) => node.closest('.grid'));
  expect(within(rows[0] as HTMLElement).getByText('Unparsed')).toBeInTheDocument();
  expect(within(rows[0] as HTMLElement).getByText('Inbox')).toBeInTheDocument();
  expect(within(rows[1] as HTMLElement).getByText('Highlight-only')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unparsed.md' }));
  expect(openLocalPath).toHaveBeenCalledWith('/Readwise/Articles/Unparsed.md');
});


it('shows cancelling state while a running import is being cancelled', () => {
  renderWithLocalization(
    <ReadwiseSyncPreviewDialog
      error={null}
      isCancelling={true}
      isPreviewing={false}
      isStarting={true}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      progress={{ processedCount: 1, status: 'cancelled', totalCount: 2 }}
      preview={createReadwiseImportPreview()}
    />
  );

  expect(screen.getByRole('button', { name: 'Cancelling' })).toBeDisabled();
  expect(screen.getByText('Cancelling Readwise import')).toBeInTheDocument();
});

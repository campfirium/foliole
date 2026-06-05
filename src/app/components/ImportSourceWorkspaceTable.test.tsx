import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { createDraftImportSource } from './importSourceWorkspaceModel';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

function createSources(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...createDraftImportSource(index),
    primaryPath: `/library/source-${index}`
  }));
}

function createSplitSource() {
  return {
    ...createDraftImportSource(101),
    highlightMode: 'split' as const,
    highlightPath: '/library/highlights',
    primaryPath: '/library/originals'
  };
}

function renderTable(sourceCount: number, onAddSource = vi.fn()) {
  return renderWithLocalization(
    <ImportSourceTable
      onAddSource={onAddSource}
      onChange={vi.fn()}
      onChangeAction={vi.fn()}
      onChooseHighlightFolder={vi.fn()}
      onChoosePrimaryFolder={vi.fn()}
      onDeleteSource={vi.fn()}
      onDisableKeepImport={vi.fn()}
      onPreviewKeepImport={vi.fn()}
      sources={createSources(sourceCount)}
    />
  );
}

it('allows adding the first import source from an empty table', () => {
  const onAddSource = vi.fn();
  renderTable(0, onAddSource);

  const addSourceButton = screen.getByRole('button', { name: 'Add source' });

  expect(addSourceButton).toBeEnabled();
  fireEvent.click(addSourceButton);
  expect(onAddSource).toHaveBeenCalledTimes(1);
});

it('keeps short import source lists directly rendered', () => {
  renderTable(1);

  expect(document.querySelector('[data-virtual-list="true"]')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Original folder draft-import-source-0' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add source' })).toBeEnabled();
});

it('virtualizes large import source lists', () => {
  renderTable(200);

  expect(document.querySelector('[data-virtual-list="true"]')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Original folder draft-import-source-0' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Original folder draft-import-source-199' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add source' })).toBeEnabled();
});

it('allows preview for generic split sources when both folders are selected', () => {
  renderWithLocalization(
    <ImportSourceTable
      onAddSource={vi.fn()}
      onChange={vi.fn()}
      onChangeAction={vi.fn()}
      onChooseHighlightFolder={vi.fn()}
      onChoosePrimaryFolder={vi.fn()}
      onDeleteSource={vi.fn()}
      onDisableKeepImport={vi.fn()}
      onPreviewKeepImport={vi.fn()}
      sources={[createSplitSource()]}
    />
  );

  const previewButton = screen.getByRole('button', { name: 'Preview draft-import-source-101' });

  expect(previewButton).toBeEnabled();
  expect(previewButton).toHaveTextContent('Preview');
  expect(previewButton).toHaveAttribute('title', 'Needs preview');
});

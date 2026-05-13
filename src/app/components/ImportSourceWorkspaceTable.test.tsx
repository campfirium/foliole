import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDraftImportSource } from './importSourceWorkspaceModel';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

function createSources(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...createDraftImportSource(index),
    primaryPath: `/library/source-${index}`
  }));
}

function renderTable(sourceCount: number) {
  return render(
    <ImportSourceTable
      onAddSource={vi.fn()}
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

it('keeps short import source lists directly rendered', () => {
  renderTable(3);

  expect(document.querySelector('[data-virtual-list="true"]')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Original folder draft-import-source-2' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add source' })).toBeEnabled();
});

it('virtualizes large import source lists', () => {
  renderTable(200);

  expect(document.querySelector('[data-virtual-list="true"]')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Original folder draft-import-source-0' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Original folder draft-import-source-199' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add source' })).toBeEnabled();
});

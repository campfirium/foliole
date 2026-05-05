import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { applyReadwiseRootPath, createReadwiseImportSources } from './importSourceWorkspaceModel';
vi.mock('../../shared/platform/importBridge', () => ({
  selectRuntimeImportDirectory: vi.fn(async () => '/tmp/chosen-folder')
}));

beforeEach(() => {
  window.electronAPI = {
    invoke: vi.fn(async () => null),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
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

  expect(await screen.findByLabelText('Readwise root folder')).toHaveTextContent('chosen-folder');
  expect(screen.queryByText('/tmp/chosen-folder')).not.toBeInTheDocument();
  expect(await screen.findByLabelText('Readwise original folder draft-import-source-1')).toHaveTextContent('Articles');
  expect(screen.queryByText('/tmp/chosen-folder/Full Document Contents/Articles')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Readwise original folder draft-import-source-1')).toHaveAttribute(
    'title',
    '/tmp/chosen-folder/Full Document Contents/Articles'
  );
  expect(screen.getByLabelText('Original folder draft-import-source-101')).toHaveAttribute('title', '/tmp/chosen-folder');
});

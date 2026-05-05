import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { selectRuntimeImportDirectory } from '../../shared/platform/importBridge';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

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

it('keeps import as the final action while scheduled rows show the next interval by default', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();

  const highlightFolder = screen.getByLabelText('Highlight folder draft-import-source-1') as HTMLButtonElement;
  const modeSelect = screen.getByLabelText('Mode draft-import-source-1');
  const triggerSelect = screen.getByLabelText('Trigger draft-import-source-1');
  const handlingSelect = screen.getByLabelText('Handling draft-import-source-1');

  expect(highlightFolder).toBeDisabled();
  expect(triggerSelect).toHaveValue('scheduled');
  expect(screen.getByRole('button', { name: 'Import draft-import-source-1' })).toBeInTheDocument();
  expect(screen.getByLabelText('Every draft-import-source-1')).toBeInTheDocument();

  fireEvent.change(modeSelect, { target: { value: 'split' } });
  expect(highlightFolder).toBeEnabled();

  fireEvent.change(handlingSelect, { target: { value: 'move' } });
  expect(selectRuntimeImportDirectory).toHaveBeenCalled();
  expect(await screen.findByDisplayValue('Move')).toBeInTheDocument();

  fireEvent.change(triggerSelect, { target: { value: 'manual' } });
  expect(screen.getByText('On import')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import draft-import-source-1' })).toBeInTheDocument();

  fireEvent.change(triggerSelect, { target: { value: 'scheduled' } });
  expect(screen.getByLabelText('Every draft-import-source-1')).toBeInTheDocument();
  expect(screen.getAllByRole('option', { name: '4 hours' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('option', { name: '24 hours' }).length).toBeGreaterThan(0);
});

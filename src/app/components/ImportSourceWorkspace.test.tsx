import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

vi.mock('../../shared/platform/importBridge', () => ({
  selectRuntimeImportDirectory: vi.fn(async () => '/tmp/chosen-folder')
}));

beforeEach(() => {
  window.electronAPI = {
    invoke: vi.fn(async () => null),
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('shows the import manager as a large dialog and switches manual rows into scheduled rows', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();

  const highlightFolder = screen.getByLabelText('Highlight folder draft-import-source-1') as HTMLButtonElement;
  const modeSelect = screen.getByLabelText('Mode draft-import-source-1');
  const triggerSelect = screen.getByLabelText('Trigger draft-import-source-1');

  expect(highlightFolder).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Import draft-import-source-1' })).toBeInTheDocument();

  fireEvent.change(modeSelect, { target: { value: 'split' } });
  expect(highlightFolder).toBeEnabled();

  fireEvent.change(triggerSelect, { target: { value: 'scheduled' } });
  expect(screen.getByLabelText('Next draft-import-source-1')).toBeInTheDocument();
});

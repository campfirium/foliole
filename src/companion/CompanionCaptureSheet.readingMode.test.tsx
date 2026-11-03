import { File } from 'node:buffer';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import type { CompanionCaptureTextSaveResult } from './companionCaptureTextController';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
function setup(options: { warning?: boolean; retry?: () => Promise<unknown> } = {}) {
  const apply = vi.fn(async (mode: 'free' | 'sequential') => { void mode; });
  const navigate = vi.fn();
  const onImportFile = vi.fn(async (): Promise<CompanionCaptureTextSaveResult> => ({ nodeId: 'book',
    epubReadingMode: { fileName: 'Book.epub', apply }, ...(options.warning ? { importWarning: 'conversion' } : {}),
    ...(options.retry ? { retryRefresh: options.retry } : {}) }));
  function Surface() {
    const [open, setOpen] = useState(true);
    return <><button onClick={() => setOpen(true)}>Add</button>
      <CompanionCaptureSheet draftScope="mode-test" open={open} onOpenChange={setOpen} onSave={vi.fn()}
        onImportFile={onImportFile} onClipboardCreated={navigate} /></>;
  }
  renderWithLocalization(<Surface />);
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Keep my draft' } });
  fireEvent.change(screen.getByLabelText('Upload File'), { target: { files: [new File(['book'], 'Book.epub')] } });
  return { apply, navigate, onImportFile };
}
it('offers the shared reading choices after import and preserves the separate draft', async () => {
  const result = setup();
  const dialog = await screen.findByRole('dialog', { name: 'Choose reading mode' });
  expect(result.navigate).toHaveBeenCalledWith('book');
  expect(dialog).toHaveTextContent('Choose how chapters enter the Review queue.');
  fireEvent.click(screen.getByRole('button', { name: /Sequential reading/ }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(result.apply).toHaveBeenCalledWith('sequential');
  expect(result.onImportFile).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByLabelText('Capture text')).toHaveValue('Keep my draft');
});
it('cancels the choice while keeping the already imported book', async () => {
  const result = setup();
  await screen.findByRole('dialog', { name: 'Choose reading mode' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(result.apply).not.toHaveBeenCalled();
  expect(result.navigate).toHaveBeenCalledTimes(1);
});
it('keeps the choice available after save failure and retries only the reading preference', async () => {
  const result = setup(); result.apply.mockRejectedValueOnce(new Error('Write unavailable'));
  await screen.findByRole('dialog', { name: 'Choose reading mode' });
  fireEvent.click(screen.getByRole('button', { name: /Free reading/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Changes could not be saved');
  fireEvent.click(screen.getByRole('button', { name: /Free reading/ }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose reading mode' })).toBeNull());
  expect(result.apply).toHaveBeenCalledTimes(2);
  expect(result.onImportFile).toHaveBeenCalledTimes(1);
});
it('preserves the choice across refresh retry without importing the book twice', async () => {
  const retry = vi.fn(async () => {}); const result = setup({ retry });
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  expect(screen.queryByRole('dialog', { name: 'Choose reading mode' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('dialog', { name: 'Choose reading mode' });
  expect(retry).toHaveBeenCalledTimes(1); expect(result.onImportFile).toHaveBeenCalledTimes(1);
});
it('shows the incomplete-import notice before the reading choice', async () => {
  setup({ warning: true });
  expect(await screen.findByRole('alert')).toHaveTextContent('File imported. Some formatting');
  expect(screen.queryByRole('dialog', { name: 'Choose reading mode' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await screen.findByRole('dialog', { name: 'Choose reading mode' });
});

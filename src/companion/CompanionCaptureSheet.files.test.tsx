import { File } from 'node:buffer';

import { cleanup, fireEvent, isInaccessible, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import type { CompanionCaptureTextSaveResult } from './companionCaptureTextController';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function setup() {
  const props = { draftScope: 'file-test', open: true, onSave: vi.fn(), onOpenChange: vi.fn(),
    onClipboardCreated: vi.fn(), onImportFile: vi.fn(async (): Promise<CompanionCaptureTextSaveResult> => ({ nodeId: 'imported' })) };
  const view = renderWithLocalization(<CompanionCaptureSheet {...props} />);
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Keep my draft' } });
  return { props, ...view };
}

function choose() {
  const file = new File(['Imported file body'], 'source.txt');
  fireEvent.change(screen.getByLabelText('Upload File'), { target: { files: [file] } });
  return file;
}

it('offers one upload action to assistive technology', () => {
  setup();
  expect(screen.getAllByRole('button', { name: 'Upload File' })).toHaveLength(1);
  expect(isInaccessible(screen.getByLabelText('Upload File'))).toBe(true);
});

it('imports the chosen file independently and keeps the draft after closing and reopening', async () => {
  const { props, rerender } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Upload File' }));
  const file = choose();
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('imported'));
  expect(props.onImportFile).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  expect(props.onSave).not.toHaveBeenCalled();
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  rerender(<CompanionCaptureSheet {...props} />);
  expect(screen.getByLabelText('Capture text')).toHaveValue('Keep my draft');
});

it('cancels file selection without saving or changing the draft', () => {
  const { props } = setup();
  fireEvent.change(screen.getByLabelText('Upload File'), { target: { files: [] } });
  expect(props.onImportFile).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Capture text')).toHaveValue('Keep my draft');
});

it('keeps the draft after import failure and allows choosing the same file again', async () => {
  const { props } = setup();
  props.onImportFile.mockRejectedValueOnce(new Error('Read failed'));
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.getByLabelText('Capture text')).toHaveValue('Keep my draft');
  choose();
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('imported'));
  expect(props.onImportFile).toHaveBeenCalledTimes(2);
});

it('shows an incomplete image notice after opening the imported topic and keeps the original draft', async () => {
  const { props, rerender } = setup();
  props.onImportFile.mockResolvedValueOnce({ nodeId: 'imported', importWarning: 'images' });
  choose();
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('imported'));
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Text imported. Some local images');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('alert')).toBeNull();
  rerender(<CompanionCaptureSheet {...props} />);
  expect(screen.getByLabelText('Capture text')).toHaveValue('Keep my draft');
});

it('preserves the conversion warning through a refresh-only retry', async () => {
  const { props, rerender } = setup();
  const retry = vi.fn(async () => {});
  props.onImportFile.mockResolvedValueOnce({ nodeId: 'imported', retryRefresh: retry, importWarning: 'conversion' });
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('imported'));
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('File imported. Some formatting');
  expect(props.onImportFile).toHaveBeenCalledTimes(1);
});

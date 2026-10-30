import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { COMPANION_ANDROID_CAPTURE_BACK_EVENT } from './companionAndroidBackEvent';
import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import type { CompanionCaptureTextSaveResult } from './companionCaptureTextController';

const clipboard = vi.hoisted(() => ({ readClipboardText: vi.fn() }));
vi.mock('../shared/platform/textClipboard', () => clipboard);

beforeEach(() => { window.localStorage.clear(); vi.resetAllMocks(); });

function renderSheet() {
  const onSave = vi.fn<(text: string) => Promise<CompanionCaptureTextSaveResult>>(async () => ({ nodeId: 'captured' }));
  const props = { draftScope: 'clipboard-test', onOpenChange: vi.fn(), onSave, open: true };
  return { ...renderWithLocalization(<CompanionCaptureSheet {...props} />), props };
}
const paste = () => fireEvent.click(screen.getByRole('button', { name: 'Paste from Clipboard' }));
const text = () => screen.getByLabelText('Capture text');

it('reads only on request and saves pasted Markdown through the capture save action', async () => {
  clipboard.readClipboardText.mockResolvedValue('# Title\n\nText');
  const { props } = renderSheet();
  expect(clipboard.readClipboardText).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeEnabled();
  paste();
  await waitFor(() => expect(text()).toHaveValue('# Title\n\nText'));
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('# Title\n\nText'));
});

it('keeps edits made during the read, prevents duplicate reads and blocks saving until it settles', async () => {
  let resolve!: (value: string) => void;
  clipboard.readClipboardText.mockReturnValue(new Promise<string>(done => { resolve = done; }));
  renderSheet();
  fireEvent.change(text(), { target: { value: 'Original' } });
  paste();
  paste();
  expect(clipboard.readClipboardText).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(text(), { target: { value: 'Latest' } });
  await act(async () => resolve('  pasted\ntext  '));
  expect(text()).toHaveValue('Latest\n  pasted\ntext  ');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

it.each(['', ' \n\t'])('reports an empty clipboard without changing the draft: %j', async value => {
  clipboard.readClipboardText.mockResolvedValue(value);
  renderSheet();
  fireEvent.change(text(), { target: { value: 'Keep this' } });
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('No text found');
  expect(text()).toHaveValue('Keep this');
});

it('reports access failure, preserves the draft and allows retry', async () => {
  clipboard.readClipboardText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    .mockResolvedValueOnce('Retry');
  renderSheet();
  fireEvent.change(text(), { target: { value: 'Keep' } });
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the clipboard');
  expect(text()).toHaveValue('Keep');
  paste();
  await waitFor(() => expect(text()).toHaveValue('Keep\nRetry'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['cancel', 'system-back'])('ignores late results after %s and reopening', async close => {
  let resolve!: (value: string) => void;
  clipboard.readClipboardText.mockReturnValue(new Promise<string>(done => { resolve = done; }));
  const { rerender, props } = renderSheet();
  fireEvent.change(text(), { target: { value: 'Original' } });
  paste();
  if (close === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  else document.dispatchEvent(new Event(COMPANION_ANDROID_CAPTURE_BACK_EVENT, { cancelable: true }));
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  rerender(<CompanionCaptureSheet {...props} open />);
  await act(async () => resolve('Stale text'));
  expect(text()).toHaveValue(close === 'cancel' ? '' : 'Original');
  expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeEnabled();
});

it('retains pasted text after save failure and blocks pasting after a committed save', async () => {
  clipboard.readClipboardText.mockResolvedValue('Paste');
  const { props } = renderSheet();
  props.onSave.mockResolvedValueOnce({ error: 'save-failed' });
  paste();
  await waitFor(() => expect(text()).toHaveValue('Paste'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(text()).toHaveValue('Paste');
  props.onSave.mockResolvedValueOnce({ nodeId: 'captured', retryRefresh: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeDisabled());
});

it('prevents clipboard reads while a save is pending', async () => {
  let resolve!: (value: CompanionCaptureTextSaveResult) => void;
  const { props } = renderSheet();
  props.onSave.mockReturnValue(new Promise(done => { resolve = done; }));
  fireEvent.change(text(), { target: { value: 'Saving' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeDisabled();
  paste();
  expect(clipboard.readClipboardText).not.toHaveBeenCalled();
  await act(async () => resolve({ error: 'save-failed' }));
  expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeEnabled();
});

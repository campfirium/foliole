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
  const props = { draftScope: 'clipboard-test', onOpenChange: vi.fn(), onClipboardCreated: vi.fn(), onSave, open: true };
  return { ...renderWithLocalization(<CompanionCaptureSheet {...props} />), props };
}
const paste = () => fireEvent.click(screen.getByRole('button', { name: 'Paste from Clipboard' }));
const text = () => screen.getByLabelText('Capture text');

it('directly creates clipboard content and opens the created topic without another Save', async () => {
  clipboard.readClipboardText.mockResolvedValue('# Title\n\nText');
  const { props } = renderSheet();
  expect(clipboard.readClipboardText).not.toHaveBeenCalled();
  paste();
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('# Title\n\nText'));
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('captured'));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it('keeps typed input separate, includes edits during reading in the restored draft and prevents duplicate imports', async () => {
  let resolve!: (value: string) => void;
  clipboard.readClipboardText.mockReturnValue(new Promise<string>(done => { resolve = done; }));
  const { props, rerender } = renderSheet();
  fireEvent.change(text(), { target: { value: 'Original' } });
  paste(); paste();
  expect(clipboard.readClipboardText).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(text(), { target: { value: 'Latest' } });
  await act(async () => resolve('Clipboard'));
  expect(props.onSave).toHaveBeenCalledExactlyOnceWith('Clipboard');
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  rerender(<CompanionCaptureSheet {...props} open />);
  expect(text()).toHaveValue('Latest');
});

it.each(['', ' \n\t'])('reports an empty clipboard without changing the draft or creating anything: %j', async value => {
  clipboard.readClipboardText.mockResolvedValue(value);
  const { props } = renderSheet();
  fireEvent.change(text(), { target: { value: 'Keep this' } });
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('No text found');
  expect(text()).toHaveValue('Keep this');
  expect(props.onSave).not.toHaveBeenCalled();
});

it('reports access failure and allows a direct import retry', async () => {
  clipboard.readClipboardText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError')).mockResolvedValueOnce('Retry');
  const { props } = renderSheet();
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the clipboard');
  expect(props.onSave).not.toHaveBeenCalled();
  paste();
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('captured'));
  expect(props.onSave).toHaveBeenCalledExactlyOnceWith('Retry');
});

it.each(['cancel', 'system-back'])('ignores late clipboard reads after %s and reopening', async close => {
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
  expect(props.onSave).not.toHaveBeenCalled();
});

it('keeps the window and draft on write failure and retries without mixing the draft', async () => {
  clipboard.readClipboardText.mockResolvedValue('Clipboard');
  const { props } = renderSheet();
  props.onSave.mockResolvedValueOnce({ error: 'save-failed' });
  fireEvent.change(text(), { target: { value: 'Draft' } });
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(text()).toHaveValue('Draft');
  expect(props.onClipboardCreated).not.toHaveBeenCalled();
  paste();
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('captured'));
  expect(props.onSave.mock.calls).toEqual([['Clipboard'], ['Clipboard']]);
});

it('retries only refresh after a committed import, even with an empty draft', async () => {
  clipboard.readClipboardText.mockResolvedValue('Clipboard');
  const { props } = renderSheet();
  const retry = vi.fn().mockRejectedValueOnce(new Error('Read unavailable')).mockResolvedValueOnce(undefined);
  props.onSave.mockResolvedValue({ nodeId: 'captured', retryRefresh: retry });
  paste();
  expect(await screen.findByRole('alert')).toHaveTextContent('Topic saved');
  expect(props.onClipboardCreated).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Paste from Clipboard' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(props.onClipboardCreated).toHaveBeenCalledWith('captured'));
  expect(props.onSave).toHaveBeenCalledTimes(1);
});

it('does not navigate when an earlier write completes after cancel and reopening', async () => {
  let resolve!: (value: CompanionCaptureTextSaveResult) => void;
  clipboard.readClipboardText.mockResolvedValue('Clipboard');
  const { props, rerender } = renderSheet();
  props.onSave.mockReturnValue(new Promise(done => { resolve = done; }));
  paste();
  await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  rerender(<CompanionCaptureSheet {...props} open={false} />);
  rerender(<CompanionCaptureSheet {...props} open />);
  await act(async () => resolve({ nodeId: 'old-topic' }));
  expect(props.onClipboardCreated).not.toHaveBeenCalled();
});

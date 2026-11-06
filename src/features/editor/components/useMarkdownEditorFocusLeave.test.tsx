import { fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { useMarkdownEditorFocusLeave } from './useMarkdownEditorFocusLeave';

function Editor({ leave, nodeId = 'topic', command, removeOnRelease = false }: {
  leave: () => void; nodeId?: string; command?: () => void; removeOnRelease?: boolean
}) {
  const [removed, setRemoved] = useState(false);
  const handlers = useMarkdownEditorFocusLeave({ nodeId, value: '', onChange: () => undefined,
    onFocusLeave: leave });
  return <><div {...handlers}><textarea aria-label="Body" /><button>Inside</button></div>
    <span>{!removed && <button onClick={command} onMouseUp={() => removeOnRelease && setRemoved(true)}>Outside</button>}</span></>;
}

it.each([false, true])('ends editing only when Tab moves focus outside (shift=%s)', shiftKey => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  body.focus();
  fireEvent.keyDown(body, { key: 'Tab', shiftKey });
  expect(leave).not.toHaveBeenCalled();
  view.getByRole('button', { name: 'Outside' }).focus();
  expect(leave).toHaveBeenCalledOnce();
});

it('keeps editing when Tab is consumed by a document command and focus stays inside', () => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  body.addEventListener('keydown', event => event.preventDefault(), { once: true });
  body.focus();
  fireEvent.keyDown(body, { key: 'Tab' });
  expect(leave).not.toHaveBeenCalled();
  view.getByRole('button', { name: 'Inside' }).focus();
  expect(leave).not.toHaveBeenCalled();
});

it.each(['before click', 'during click'])('waits until click handlers finish when blur occurs %s', async when => {
  const order: string[] = [];
  const leave = vi.fn(() => { order.push('exit'); });
  const view = render(<Editor leave={leave} command={() => {
    order.push('command');
    if (when === 'during click') view.getByRole('button', { name: 'Outside' }).focus();
  }} />);
  const body = view.getByLabelText('Body');
  const button = view.getByRole('button', { name: 'Outside' });
  body.focus();
  fireEvent.pointerDown(button, { pointerId: 1 });
  if (when === 'before click') button.focus();
  expect(leave).not.toHaveBeenCalled();
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(order).toEqual(['command']);
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  expect(order).toEqual(['command', 'exit']);
});

it.each(['refocus', 'node'])('cancels an obsolete pointer exit after %s', async reason => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  const button = view.getByRole('button', { name: 'Outside' });
  body.focus();
  fireEvent.pointerDown(button, { pointerId: 1 });
  button.focus();
  fireEvent.click(button);
  if (reason === 'refocus') body.focus();
  else view.rerender(<Editor leave={leave} nodeId="other" />);
  // A later interaction completes too, so this is not an assertion made before queued delivery.
  fireEvent.pointerDown(button, { pointerId: 2 });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(leave).toHaveBeenCalledTimes(reason === 'refocus' ? 1 : 0));
});

it('finishes cancelled pointer input without waiting for a click that will never arrive', async () => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  const button = view.getByRole('button', { name: 'Outside' });
  body.focus();
  fireEvent.pointerDown(button, { pointerId: 1 });
  button.focus();
  fireEvent.pointerCancel(button, { pointerId: 1 });
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
});

it('finishes a pointer exit when mouseup removes the target and prevents any click', async () => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} removeOnRelease />);
  const button = view.getByRole('button', { name: 'Outside' });
  view.getByLabelText('Body').focus();
  fireEvent.pointerDown(button, { pointerId: 1 });
  button.focus();
  fireEvent.mouseUp(button);
  expect(button.isConnected).toBe(false);
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
});

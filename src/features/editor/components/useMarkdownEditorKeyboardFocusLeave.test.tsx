import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useMarkdownEditorKeyboardFocusLeave } from './useMarkdownEditorKeyboardFocusLeave';

function Editor({ leave, nodeId = 'topic' }: { leave: () => void; nodeId?: string }) {
  const handlers = useMarkdownEditorKeyboardFocusLeave({ nodeId, value: '', onChange: () => undefined,
    onKeyboardFocusLeave: leave });
  return <><div {...handlers}><textarea aria-label="Body" /><button>Inside</button></div><button>Outside</button></>;
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

it('keeps editing when Tab is consumed by a document command or focus stays inside', () => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  body.addEventListener('keydown', event => event.preventDefault(), { once: true });
  body.focus();
  fireEvent.keyDown(body, { key: 'Tab' });
  view.getByRole('button', { name: 'Outside' }).focus();
  expect(leave).not.toHaveBeenCalled();
  body.focus();
  fireEvent.keyDown(body, { key: 'Tab' });
  view.getByRole('button', { name: 'Inside' }).focus();
  expect(leave).not.toHaveBeenCalled();
});

it.each(['release', 'pointer', 'node'])('does not mistake a later blur for Tab navigation after %s', reason => {
  const leave = vi.fn();
  const view = render(<Editor leave={leave} />);
  const body = view.getByLabelText('Body');
  body.focus();
  fireEvent.keyDown(body, { key: 'Tab' });
  if (reason === 'release') fireEvent.keyUp(body, { key: 'Tab' });
  if (reason === 'pointer') fireEvent.pointerDown(view.getByRole('button', { name: 'Outside' }));
  if (reason === 'node') view.rerender(<Editor leave={leave} nodeId="other" />);
  view.getByRole('button', { name: 'Outside' }).focus();
  expect(leave).not.toHaveBeenCalled();
});

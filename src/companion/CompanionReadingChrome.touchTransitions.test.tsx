import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { ReadingChrome } from './CompanionReadingChrome';
import { useCompanionContentEditingActions } from './useCompanionContentEditingActions';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

function touch(target: HTMLElement, type: string) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
  });
  fireEvent(target, event);
}

afterEach(() => { fireEvent.pointerDown(document.body); });

function EditingRoute() {
  const reading = useImmersiveReadableArticleState();
  const actions = useCompanionContentEditingActions({
    activity: undefined, editing: reading.isContentEditing,
    enter: reading.enterContentEditing, exit: reading.exitContentEditing,
    prepareEnter() {}, focusEditor() {}
  });
  return <ReadingChrome actionsAtTop canEditContent isContentEditing={reading.isContentEditing}
    onToggleContentEditing={actions.toggleContentEditing} onCancelContentEditing={actions.cancelContentEditing}
    onExit={() => {}} onOpenActions={() => {}} onOpenOutline={() => {}} title="Review" />;
}

it('keeps editing open when the touch click lands on the replacement Done button', async () => {
  render(<EditingRoute />);
  const edit = screen.getByRole('button', { name: 'Edit content' });
  touch(edit, 'pointerdown');
  touch(edit, 'pointerup');
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Done' }), { detail: 1 }); });
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

  const done = screen.getByRole('button', { name: 'Done' });
  touch(done, 'pointerdown');
  await act(async () => touch(done, 'pointerup'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit content' }), { detail: 1 });
  expect(screen.getByRole('button', { name: 'Edit content' })).toBeInTheDocument();
});

function NavigationRoute() {
  const [topic, setTopic] = useState(0);
  return <><output>Topic {topic}</output><ReadingChrome key={topic} canEditContent
    navigation={{ disabled: false, error: false,
      previous: () => flushSync(() => setTopic(topic - 1)),
      next: () => flushSync(() => setTopic(topic + 1)) }}
    onExit={() => {}} onOpenActions={() => {}} onOpenOutline={() => {}} title={`Topic ${topic}`} /></>;
}

it.each([['Next topic', 1], ['Previous topic', -1]] as const)(
  'moves once when %s remounts its controls during the touch', (name, expected) => {
    render(<NavigationRoute />);
    const button = screen.getByRole('button', { name });
    touch(button, 'pointerdown');
    touch(button, 'pointerup');
    fireEvent.click(screen.getByRole('button', { name }), { detail: 1 });
    expect(screen.getByRole('status')).toHaveTextContent(`Topic ${expected}`);
    const nextButton = screen.getByRole('button', { name });
    touch(nextButton, 'pointerdown');
    touch(nextButton, 'pointerup');
    expect(screen.getByRole('status')).toHaveTextContent(`Topic ${expected * 2}`);
  }
);

function ExitRoute({ underlying }: { underlying: () => void }) {
  const [open, setOpen] = useState(true);
  const replace = () => flushSync(() => setOpen(false));
  return open ? <ReadingChrome onExit={replace}
    onOpenActions={replace} onOpenOutline={replace} title="Topic" />
    : <button onClick={underlying} type="button">Open topic</button>;
}

it.each(['Exit', 'Outline', 'More reading actions'])('does not pass %s through to the newly opened surface', name => {
  const underlying = vi.fn();
  render(<ExitRoute underlying={underlying} />);
  const exit = screen.getByRole('button', { name });
  touch(exit, 'pointerdown');
  touch(exit, 'pointerup');
  const open = screen.getByRole('button', { name: 'Open topic' });
  fireEvent.click(open, { detail: 1 });
  expect(underlying).not.toHaveBeenCalled();
  fireEvent.click(open, { detail: 0 });
  expect(underlying).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(open);
  fireEvent.click(open, { detail: 1 });
  expect(underlying).toHaveBeenCalledTimes(2);
});

function RevealRoute() {
  const reading = useImmersiveReadableArticleState();
  return <section onPointerDown={reading.handleSurfacePointerDown} onPointerUp={reading.handleSurfacePointerUp}
    onClick={reading.handleSurfaceClick}>
    <p>Body</p>
    <ReadingChrome canEditContent visible={reading.isChromeVisible} isContentEditing={reading.isContentEditing}
      onToggleContentEditing={reading.enterContentEditing} onExit={() => {}}
      onOpenActions={() => {}} onOpenOutline={() => {}} title="Topic" />
  </section>;
}

it('reveals reading controls without also activating a newly revealed button', () => {
  render(<RevealRoute />);
  expect(screen.queryByRole('button', { name: 'Edit content' })).not.toBeInTheDocument();
  const body = screen.getByText('Body');
  touch(body, 'pointerdown');
  touch(body, 'pointerup');
  fireEvent.click(screen.getByRole('button', { name: 'Edit content' }), { detail: 1 });
  expect(screen.getByRole('button', { name: 'Edit content' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
});

it.each(['pointerdown', 'keydown'])('keeps the next real input after a touch with no click: %s', type => {
  const underlying = vi.fn();
  render(<ExitRoute underlying={underlying} />);
  const exit = screen.getByRole('button', { name: 'Exit' });
  touch(exit, 'pointerdown');
  touch(exit, 'pointerup');
  const open = screen.getByRole('button', { name: 'Open topic' });
  fireEvent(open, new Event(type, { bubbles: true }));
  fireEvent.click(open, { detail: 1 });
  expect(underlying).toHaveBeenCalledTimes(1);
});

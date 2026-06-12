import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';

function FloatingDialogHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">
        Open dialog
      </button>
      {isOpen ? <FloatingDialog onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function FloatingDialog({ onClose }: { onClose: () => void }) {
  const focusTrap = useFloatingDialogFocusTrap();

  return (
    <div onKeyDown={focusTrap.handleKeyDown} ref={focusTrap.containerRef} role="dialog">
      <button onClick={onClose} type="button">
        Close dialog
      </button>
    </div>
  );
}

function AutoFocusedFloatingDialog() {
  const focusTrap = useFloatingDialogFocusTrap();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div onKeyDown={focusTrap.handleKeyDown} ref={focusTrap.containerRef} role="dialog">
      <input aria-label="Dialog search" ref={inputRef} />
    </div>
  );
}

function AutoFocusedFloatingDialogHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">
        Open search
      </button>
      {isOpen ? <AutoFocusedFloatingDialog /> : null}
    </>
  );
}

function RoleButtonDialog() {
  const focusTrap = useFloatingDialogFocusTrap();

  return (
    <div onKeyDown={focusTrap.handleKeyDown} ref={focusTrap.containerRef} role="dialog">
      <button type="button">First action</button>
      <div role="button" tabIndex={0}>
        Last role action
      </div>
    </div>
  );
}

function LabeledFloatingDialog({ label, onClose }: { label: string; onClose: () => void }) {
  const focusTrap = useFloatingDialogFocusTrap();

  return (
    <div aria-label={label} onKeyDown={focusTrap.handleKeyDown} ref={focusTrap.containerRef} role="dialog">
      <button onClick={onClose} type="button">
        Close {label}
      </button>
    </div>
  );
}

function NestedFloatingDialogHarness() {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);

  return (
    <>
      <button onClick={() => setParentOpen(true)} type="button">
        Open parent
      </button>
      {parentOpen ? (
        <ParentDialog
          childOpen={childOpen}
          onChildClose={() => setChildOpen(false)}
          onChildOpen={() => setChildOpen(true)}
          onClose={() => setParentOpen(false)}
        />
      ) : null}
    </>
  );
}

function ParentDialog({
  childOpen,
  onChildClose,
  onChildOpen,
  onClose
}: {
  childOpen: boolean;
  onChildClose: () => void;
  onChildOpen: () => void;
  onClose: () => void;
}) {
  const focusTrap = useFloatingDialogFocusTrap();

  return (
    <div aria-label="Parent dialog" onKeyDown={focusTrap.handleKeyDown} ref={focusTrap.containerRef} role="dialog">
      <button onClick={onChildOpen} type="button">
        Open child
      </button>
      <button onClick={onClose} type="button">
        Close parent
      </button>
      {childOpen ? <LabeledFloatingDialog label="Child dialog" onClose={onChildClose} /> : null}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('does not register document focus tracking listeners on import', async () => {
  const addSpy = vi.spyOn(document, 'addEventListener');
  vi.resetModules();
  await import('./useFloatingDialogFocusTrap');

  expect(addSpy).not.toHaveBeenCalled();
});

it('restores focus to the trigger when the floating dialog closes', async () => {
  render(<FloatingDialogHarness />);

  const trigger = screen.getByRole('button', { name: 'Open dialog' });
  trigger.focus();
  fireEvent.click(trigger);

  const closeButton = screen.getByRole('button', { name: 'Close dialog' });
  closeButton.focus();
  fireEvent.click(closeButton);

  await waitFor(() => expect(trigger).toHaveFocus());
});

it('does not restore previous focus during the StrictMode mount probe', async () => {
  vi.useFakeTimers();
  try {
    render(
      <StrictMode>
        <AutoFocusedFloatingDialogHarness />
      </StrictMode>
    );

    const trigger = screen.getByRole('button', { name: 'Open search' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole('textbox', { name: 'Dialog search' });
    expect(input).toHaveFocus();
    await vi.runOnlyPendingTimersAsync();

    expect(input).toHaveFocus();
  } finally {
    vi.useRealTimers();
  }
});

it('cycles tab focus inside the floating dialog', () => {
  render(<FloatingDialog onClose={() => undefined} />);

  const closeButton = screen.getByRole('button', { name: 'Close dialog' });
  closeButton.focus();

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
  expect(closeButton).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
  expect(closeButton).toHaveFocus();
});

it('cycles tab focus through role-based controls inside the floating dialog', () => {
  render(<RoleButtonDialog />);

  const firstButton = screen.getByRole('button', { name: 'First action' });
  const roleButton = screen.getByRole('button', { name: 'Last role action' });
  roleButton.focus();

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
  expect(firstButton).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
  expect(roleButton).toHaveFocus();
});

it('keeps focus stable when a keyboard-opened floating dialog closes', async () => {
  render(<FloatingDialogHarness />);

  const trigger = screen.getByRole('button', { name: 'Open dialog' });
  trigger.focus();
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  fireEvent.click(trigger);

  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

  await waitFor(() => expect(trigger).toHaveFocus());
});

it('restores focus through nested floating dialogs', async () => {
  render(<NestedFloatingDialogHarness />);

  const parentTrigger = screen.getByRole('button', { name: 'Open parent' });
  parentTrigger.focus();
  fireEvent.click(parentTrigger);

  const childTrigger = screen.getByRole('button', { name: 'Open child' });
  childTrigger.focus();
  fireEvent.click(childTrigger);

  fireEvent.click(screen.getByRole('button', { name: 'Close Child dialog' }));
  await waitFor(() => expect(childTrigger).toHaveFocus());

  fireEvent.click(screen.getByRole('button', { name: 'Close parent' }));
  await waitFor(() => expect(parentTrigger).toHaveFocus());
});

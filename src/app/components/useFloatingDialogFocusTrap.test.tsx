import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';

function FloatingDialog({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const focusTrap = useFloatingDialogFocusTrap(isOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-label="Floating dialog"
      onKeyDown={focusTrap.handleKeyDown}
      ref={focusTrap.containerRef}
      role="dialog"
    >
      <button onClick={onClose} type="button">
        Close floating dialog
      </button>
    </div>
  );
}

function RadixDialogWithFloatingDialog() {
  const [floatingOpen, setFloatingOpen] = useState(false);

  return (
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>Radix dialog</AppDialogTitle>
          <button onClick={() => setFloatingOpen(true)} type="button">
            Open floating dialog
          </button>
          <FloatingDialog isOpen={floatingOpen} onClose={() => setFloatingOpen(false)} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

it('restores focus to a Radix dialog control after a mounted floating dialog closes', async () => {
  render(<RadixDialogWithFloatingDialog />);

  const floatingTrigger = screen.getByRole('button', { name: 'Open floating dialog' });
  floatingTrigger.focus();
  fireEvent.click(floatingTrigger);

  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: 'Floating dialog' })).toBeInTheDocument()
  );
  const floatingCloseButton = screen.getByRole('button', { name: 'Close floating dialog' });
  floatingCloseButton.focus();
  fireEvent.click(floatingCloseButton);

  await waitFor(() => expect(floatingTrigger).toHaveFocus());
});

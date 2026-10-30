import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';

beforeEach(() => window.localStorage.clear());

function CaptureLauncher() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Add text</button>
    <CompanionCaptureSheet draftScope="focus-test" onOpenChange={setOpen} onSave={vi.fn()} open={open} />
  </>;
}

it('focuses the text input when launched and again when reopened', () => {
  renderWithLocalization(<CaptureLauncher />);
  fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
  expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New topic' } });
  expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
  expect(screen.getByRole('textbox')).toHaveFocus();
});

it('does not steal focus back after the user moves to another action', () => {
  const props = { draftScope: 'focus-test', onOpenChange: vi.fn(), onSave: vi.fn(), open: true };
  const { rerender } = renderWithLocalization(<CompanionCaptureSheet {...props} />);
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  cancel.focus();
  rerender(<CompanionCaptureSheet {...props} />);
  expect(cancel).toHaveFocus();
});

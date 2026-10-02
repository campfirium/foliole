import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { expect, it } from 'vitest';

import { AppNoticeDialog } from './AppNoticeDialog';
import { AppDialog, AppDialogContent, AppDialogPortal, AppDialogTitle } from './Dialog';

function Notice({ title }: { title: string }) {
  const [open, setOpen] = useState(true);
  return (
    <AppNoticeDialog open={open} onOpenChange={setOpen}>
      <AppDialogPortal>
        <AppDialogContent aria-describedby={undefined} layout="notice">
          <AppDialogTitle>{title}</AppDialogTitle>
          <button onClick={() => setOpen(false)}>Close {title}</button>
        </AppDialogContent>
      </AppDialogPortal>
    </AppNoticeDialog>
  );
}

it('advances independent notices without overlap in Strict Mode', async () => {
  render(<StrictMode><Notice title="First" /><Notice title="Second" /></StrictMode>);
  expect(await screen.findByRole('dialog')).toHaveTextContent('First');
  expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close First' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Second');
  fireEvent.click(screen.getByRole('button', { name: 'Close Second' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('removes withdrawn waiting notices and releases the slot when the active notice unmounts', async () => {
  const view = render(<><Notice key="first" title="First" /><Notice key="second" title="Second" /><Notice key="third" title="Third" /></>);
  view.rerender(<><Notice key="first" title="First" /><Notice key="third" title="Third" /></>);
  expect(screen.getByRole('dialog')).toHaveTextContent('First');
  view.rerender(<Notice key="third" title="Third" />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Third');
  expect(screen.queryByText('Second')).toBeNull();
});

it('allows confirmation notices within an existing task dialog', async () => {
  render(
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>Settings</AppDialogTitle>
          <Notice title="Confirm change" />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
  expect(await screen.findByRole('dialog', { name: 'Confirm change' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close Confirm change' }));
  expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeVisible();
});

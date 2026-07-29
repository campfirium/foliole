import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppButton } from './Button';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

it('renders dialog content with shared floating surface baseline', async () => {
  render(
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Demo overlay" role="presentation" />
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>Shared dialog</AppDialogTitle>
          <AppDialogDescription>Body copy</AppDialogDescription>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );

  const dialog = await screen.findByRole('dialog', { name: 'Shared dialog' });
  expect(dialog).toBeInTheDocument();
  expect(dialog.className).toContain('rounded-lg');
  expect(dialog.className).toContain('shadow-panel');
  expect(dialog.className).toContain('border-[var(--app-floating-border-color)]');
  expect(dialog.className).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(screen.getByLabelText('Demo overlay')).toBeInTheDocument();
  expect(screen.getByText('Shared dialog').className).toContain('text-ui-xl');
  expect(screen.getByText('Body copy').className).toContain('text-foreground/68');
  expect(screen.getByText('Body copy')).toBeInTheDocument();
});

it('owns task dialog spacing in the shared pattern', async () => {
  render(
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogContent layout="task">
          <AppDialogTitle>Task dialog</AppDialogTitle>
          <AppDialogBody>Task content</AppDialogBody>
          <AppDialogActions><AppButton>Done</AppButton></AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );

  const dialog = await screen.findByRole('dialog', { name: 'Task dialog' });
  expect(dialog.className).toContain('p-dialog-gutter');
  expect(screen.getByText('Task content').className).toContain('mt-dialog-section-gap');
  expect(screen.getByRole('button', { name: 'Done' }).parentElement?.className).toContain('mt-dialog-section-gap');
});

it('keeps initial dialog focus on the surface instead of the first action', async () => {
  render(
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>Confirm action</AppDialogTitle>
          <AppButton>Cancel</AppButton>
          <AppButton>Continue</AppButton>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );

  const dialog = await screen.findByRole('dialog', { name: 'Confirm action' });
  expect(dialog).toHaveAttribute('tabindex', '-1');
  expect(document.activeElement).toBe(dialog);
  expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveFocus();
});

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

it('renders dialog content with shared floating surface baseline', () => {
  render(
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Demo overlay" role="presentation" />
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>Shared dialog</AppDialogTitle>
          <p>Body copy</p>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );

  const dialog = screen.getByRole('dialog', { name: 'Shared dialog' });
  expect(dialog).toBeInTheDocument();
  expect(dialog.className).toContain('rounded-lg');
  expect(dialog.className).toContain('shadow-panel');
  expect(dialog.className).toContain('border-[var(--app-floating-border-color)]');
  expect(dialog.className).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(screen.getByLabelText('Demo overlay')).toBeInTheDocument();
  expect(screen.getByText('Body copy')).toBeInTheDocument();
});

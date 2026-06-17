import { render, screen } from '@testing-library/react';
import { beforeAll } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { AppEmptyState, AppErrorState, AppLoadingState, AppSpinner } from './EmptyState';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

describe('AppSpinner', () => {
  it('exposes a named progress indicator when not decorative', () => {
    render(<AppSpinner label="Progress indicator" size="sm" />);

    const spinner = screen.getByLabelText('Progress indicator');
    expect(spinner).toHaveClass('h-4', 'w-4', 'animate-spin');
    expect(spinner).not.toHaveAttribute('aria-hidden');
  });

  it('supports fixed large overlay sizing', () => {
    render(<AppSpinner label="PDF progress" size="lg" />);

    expect(screen.getByLabelText('PDF progress')).toHaveClass('h-10', 'w-10');
  });

  it('supports state tone styling for progress indicators', () => {
    render(<AppSpinner label="Sync progress" tone="accent" />);

    expect(screen.getByLabelText('Sync progress').className).toContain('border-t-[rgb(var(--app-accent-color-rgb))]');
  });

  it('hides decorative indicators from assistive technology', () => {
    const { container } = render(<AppSpinner decorative label="Ignored label" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByLabelText('Ignored label')).not.toBeInTheDocument();
  });
});

describe('AppLoadingState', () => {
  it('uses only the shared spinner while announcing progress state', () => {
    const { container } = render(<AppLoadingState />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('data-state-surface-tone', 'loading');
    expect(container.querySelector('.animate-spin')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.animate-spin')?.className).toContain('border-t-foreground/55');
  });

  it('can carry loading copy without changing the state surface contract', () => {
    render(<AppLoadingState description="Preparing preview." label="Preparing" title="Loading" />);

    expect(screen.getByRole('status', { name: 'Preparing' })).toHaveAttribute('data-state-surface-tone', 'loading');
    expect(screen.getByText('Loading').className).toContain('text-ui-md');
    expect(screen.getByText('Loading').className).toContain('text-foreground/72');
    expect(screen.getByText('Preparing preview.').className).toContain('text-ui-base');
  });
});

describe('AppEmptyState', () => {
  it('uses UI type scale classes for empty state copy', () => {
    const { container } = render(<AppEmptyState description="No due cards." title="Nothing to review" />);

    expect(container.firstElementChild?.className).toContain('text-ui-md');
    expect(container.firstElementChild?.className).toContain('min-h-state-surface');
    expect(screen.getByRole('status')).toHaveAttribute('data-state-surface-scope', 'document');
    expect(screen.getByRole('status')).toHaveAttribute('data-state-surface-tone', 'empty');
    expect(screen.getByText('Nothing to review').className).toContain('text-ui-md');
    expect(screen.getByText('Nothing to review').className).toContain('text-foreground/72');
    expect(screen.getByText('No due cards.').className).toContain('text-ui-base');
  });

  it('can render a decorative visual anchor before empty copy', () => {
    render(
      <AppEmptyState
        description="No due cards."
        icon={<span data-testid="empty-icon" />}
        title="Nothing to review"
      />
    );

    const status = screen.getByRole('status');
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(status.firstElementChild?.firstElementChild).toHaveAttribute('data-testid', 'empty-icon');
  });
});

it('separates document, panel, and floating state surface scope', () => {
  render(
    <>
      <AppEmptyState description="No note." title="Empty document" />
      <AppLoadingState label="Panel loading" surface="panel" />
      <AppErrorState description="Try again." surface="floating" title="Command failed" />
    </>
  );

  expect(screen.getByText('Empty document').closest('[data-state-surface-scope]')).toHaveAttribute('data-state-surface-scope', 'document');
  expect(screen.getByRole('status', { name: 'Panel loading' })).toHaveAttribute('data-state-surface-scope', 'panel');
  expect(screen.getByRole('status', { name: 'Panel loading' }).className).toContain('px-settings-panel-x');
  expect(screen.getByText('Command failed').closest('[data-state-surface-scope]')).toHaveAttribute('data-state-surface-scope', 'floating');
  expect(screen.getByText('Command failed').closest('[data-state-surface-scope]')?.className).not.toContain('min-h-state-surface');
});

describe('AppErrorState', () => {
  it('uses UI type scale classes for error state copy', () => {
    render(<AppErrorState description="Try again." title="Sync failed" />);

    expect(screen.getByText('Sync failed').className).toContain('text-ui-md');
    expect(screen.getByText('Sync failed').className).toContain('text-error');
    expect(screen.getByText('Try again.').className).toContain('text-ui-base');
    expect(screen.getByRole('alert')).toHaveAttribute('data-state-surface-tone', 'error');
  });
});

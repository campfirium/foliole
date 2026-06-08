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
    expect(container.querySelector('.animate-spin')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('AppEmptyState', () => {
  it('uses UI type scale classes for empty state copy', () => {
    const { container } = render(<AppEmptyState description="No due cards." title="Nothing to review" />);

    expect(container.firstElementChild?.className).toContain('text-ui-md');
    expect(screen.getByText('Nothing to review').className).toContain('text-ui-md');
    expect(screen.getByText('No due cards.').className).toContain('text-ui-base');
  });
});

describe('AppErrorState', () => {
  it('uses UI type scale classes for error state copy', () => {
    render(<AppErrorState description="Try again." title="Sync failed" />);

    expect(screen.getByText('Sync failed').className).toContain('text-ui-md');
    expect(screen.getByText('Try again.').className).toContain('text-ui-base');
  });
});

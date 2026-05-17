import { render, screen } from '@testing-library/react';

import { AppLoadingState, AppSpinner } from './EmptyState';

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

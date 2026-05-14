import { render, screen } from '@testing-library/react';

import { AppLoadingState, AppSpinner } from './EmptyState';

describe('AppSpinner', () => {
  it('exposes a named loading indicator when not decorative', () => {
    render(<AppSpinner label="Loading topics" size="sm" />);

    const spinner = screen.getByLabelText('Loading topics');
    expect(spinner).toHaveClass('h-4', 'w-4', 'animate-spin');
    expect(spinner).not.toHaveAttribute('aria-hidden');
  });

  it('supports fixed large overlay sizing', () => {
    render(<AppSpinner label="Loading PDF" size="lg" />);

    expect(screen.getByLabelText('Loading PDF')).toHaveClass('h-10', 'w-10');
  });

  it('hides decorative indicators from assistive technology', () => {
    const { container } = render(<AppSpinner decorative label="Ignored label" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByLabelText('Ignored label')).not.toBeInTheDocument();
  });
});

describe('AppLoadingState', () => {
  it('uses the shared spinner while announcing loading state', () => {
    render(<AppLoadingState description="Loading topics and folders." title="Loading workspace" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Loading workspace indicator')).toHaveClass('h-6', 'w-6', 'animate-spin');
  });
});

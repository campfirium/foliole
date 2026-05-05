import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { StartupErrorBoundary } from './StartupErrorBoundary';

function ThrowingChild(): JSX.Element {
  throw new Error('renderer crashed');
}

it('shows a renderer failure surface instead of leaving a blank app', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const preventExpectedError = (event: ErrorEvent) => {
    if (event.message.includes('renderer crashed')) {
      event.preventDefault();
    }
  };
  window.addEventListener('error', preventExpectedError);
  const onError = vi.fn();

  try {
    render(
      <StartupErrorBoundary moduleLabel="Renderer" onError={onError}>
        <ThrowingChild />
      </StartupErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Foliole startup encountered a problem');
    expect(screen.getByText('renderer crashed')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('error', preventExpectedError);
    consoleError.mockRestore();
  }
});

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';

it('renders the registered immersive reading shortcuts', () => {
  render(<ImmersiveShortcutsOverlay visible />);

  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveTextContent('Toggle immersive reading');
  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByText('F11')).toBeInTheDocument();
  expect(screen.getByText('Toggle immersive reading').closest('li')).toHaveAttribute('aria-keyshortcuts', 'F11');
  expect(screen.getByText('ArrowDown')).toBeInTheDocument();
  expect(screen.getByText('Select the next paragraph').closest('li')).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
  expect(screen.getByText('ArrowUp')).toBeInTheDocument();
});

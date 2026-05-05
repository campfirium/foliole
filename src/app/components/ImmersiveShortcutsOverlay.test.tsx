import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';

it('renders the registered immersive reading shortcuts', () => {
  render(<ImmersiveShortcutsOverlay visible />);

  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveTextContent('Toggle immersive reading');
  expect(screen.getByText('F11')).toBeInTheDocument();
  expect(screen.getByText('Space / ArrowDown')).toBeInTheDocument();
  expect(screen.getByText('Shift+Space / ArrowUp')).toBeInTheDocument();
});

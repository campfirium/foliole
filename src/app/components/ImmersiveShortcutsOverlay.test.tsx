import { screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';

function setElectronHost(enabled: boolean) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: enabled ? {} : undefined
  });
}

afterEach(() => {
  setElectronHost(false);
});

it('renders the registered immersive reading shortcuts', () => {
  setElectronHost(true);
  renderWithLocalization(<ImmersiveShortcutsOverlay visible />);

  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveTextContent('Toggle immersive reading');
  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByText('F11')).toBeInTheDocument();
  expect(screen.getByText('Toggle immersive reading').closest('li')).toHaveAttribute('aria-keyshortcuts', 'F11');
  expect(screen.getByText('ArrowDown')).toBeInTheDocument();
  expect(screen.getByText('ArrowDown').closest('li')).toHaveTextContent('Select the next paragraph');
  expect(screen.getByText('ArrowDown').closest('li')).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
  expect(screen.getByText('ArrowUp')).toBeInTheDocument();
});

it('does not advertise F11 for immersive reading in the browser host', () => {
  renderWithLocalization(<ImmersiveShortcutsOverlay visible />);

  expect(screen.queryByText('F11')).not.toBeInTheDocument();
  expect(screen.queryByText('Toggle immersive reading')).not.toBeInTheDocument();
  expect(screen.getByText('ArrowDown')).toBeInTheDocument();
});

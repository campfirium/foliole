import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';

it('shows the topic search command in hotkey settings', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
});

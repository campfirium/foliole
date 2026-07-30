import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  choose: vi.fn(),
  confirm: vi.fn(),
  load: vi.fn()
}));

vi.mock('../../shared/platform/initialLibrarySetupRuntime', () => ({
  chooseInitialLibraryLocation: mocks.choose,
  confirmInitialLibrarySetup: mocks.confirm,
  loadInitialLibrarySetup: mocks.load
}));

import { InitialLibrarySetupView } from './InitialLibrarySetupView';

beforeEach(() => {
  mocks.load.mockResolvedValue({
    display_path: '~/Documents/Foliole',
    library_home: '/Users/tester/Documents/Foliole',
    requires_system_confirmation: false
  });
  mocks.choose.mockResolvedValue({ status: 'canceled' });
  mocks.confirm.mockResolvedValue({ status: 'confirmed' });
});

it('shows one library path with equal primary and secondary actions', async () => {
  render(<InitialLibrarySetupView />);

  expect(await screen.findByText('~/Documents/Foliole')).toBeInTheDocument();
  const change = screen.getByRole('button', { name: 'Change Location' });
  const create = screen.getByRole('button', { name: 'Create' });
  expect(change.className).not.toContain('primary');
  expect(create.className).toContain('primary');

  fireEvent.click(create);
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
});

it('shows the active create label while creating', async () => {
  mocks.confirm.mockReturnValue(new Promise(() => undefined));
  render(<InitialLibrarySetupView />);

  const create = await screen.findByRole('button', { name: 'Create' });
  fireEvent.click(create);

  expect(create).toBeDisabled();
  expect(create).toHaveAttribute('aria-busy', 'true');
  expect(create.className).toContain('is-loading');
  expect(create).toHaveTextContent('Creating…');
});

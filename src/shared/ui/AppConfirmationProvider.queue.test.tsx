import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { requestAppChoice } from './appChoice';
import { requestAppConfirmation, requestAppTextInput } from './appConfirmation';
import { AppConfirmationProvider } from './AppConfirmationProvider';

it('preserves consecutive confirmations and resolves each result in order', async () => {
  renderWithLocalization(<AppConfirmationProvider><div>Workspace</div></AppConfirmationProvider>);
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => {
    first = requestAppConfirmation({ title: 'First notice', confirmLabel: 'First done' });
    second = requestAppConfirmation({ title: 'Second notice', confirmLabel: 'Second done' });
  });
  expect(await screen.findByRole('dialog')).toHaveTextContent('First notice');
  expect(screen.queryByText('Second notice')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'First done' }));
  await expect(first).resolves.toBe(true);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Second notice');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(second).resolves.toBe(false);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('shows a choice after a confirmation without overlapping or losing an input request', async () => {
  renderWithLocalization(<AppConfirmationProvider><div>Workspace</div></AppConfirmationProvider>);
  let confirmation!: Promise<boolean>;
  let choice!: Promise<string | null>;
  let input!: Promise<string | null>;
  act(() => {
    confirmation = requestAppConfirmation({ title: 'Backup restored', confirmLabel: 'Done' });
    choice = requestAppChoice({ title: 'Choose device', choices: [{ label: 'Mac', value: 'mac' }] });
    input = requestAppTextInput({ title: 'Rename', inputLabel: 'Name', defaultValue: 'Original' });
  });
  expect(await screen.findByRole('dialog')).toHaveTextContent('Backup restored');
  expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await expect(confirmation).resolves.toBe(true);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Choose device');
  fireEvent.click(screen.getByRole('button', { name: 'Mac' }));
  await expect(choice).resolves.toBe('mac');
  expect(await screen.findByRole('dialog')).toHaveTextContent('Rename');
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await expect(input).resolves.toBe('Updated');
});

it('cancels active and waiting requests when their provider unmounts', async () => {
  const view = renderWithLocalization(<AppConfirmationProvider><div>Workspace</div></AppConfirmationProvider>);
  let first!: Promise<boolean>;
  let second!: Promise<string | null>;
  act(() => {
    first = requestAppConfirmation({ title: 'First' });
    second = requestAppChoice({ title: 'Second', choices: [{ label: 'Mac', value: 'mac' }] });
  });
  view.unmount();
  await expect(first).resolves.toBe(false);
  await expect(second).resolves.toBeNull();
});

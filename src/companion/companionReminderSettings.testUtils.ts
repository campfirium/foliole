import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export async function save() {
  const button = screen.getByRole('button', { name: 'Save' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
}

export async function edit(message: string) {
  const row = await screen.findByRole('button', { name: 'Edit reminder: ' + message });
  await waitFor(() => expect(row).toBeEnabled());
  fireEvent.click(row);
}

export async function enable(message: string, expected?: string) {
  const toggle = screen.getByRole('switch', { name: 'Enabled: ' + message });
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  await waitFor(() => expect(toggle).toBeEnabled());
  if (expected) expect(await screen.findByText(expected)).toBeVisible();
}

export async function setDraft(message: string, time: string) {
  if (screen.queryByRole('button', { name: 'Trigger Foreground duration' })) {
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Foreground duration' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Scheduled' }));
  }
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } });
}

export async function savePreset(preset: string, message: string, time: string) {
  await edit(preset);
  await setDraft(message, time);
  await save();
}

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { requestAppConfirmation, requestAppTextInput } from './appConfirmation';
import { AppConfirmationProvider } from './AppConfirmationProvider';

function ConfirmationDemo({ onResult }: { onResult: (value: boolean) => void }) {
  return (
    <AppConfirmationProvider>
      <button
        onClick={() => {
          void requestAppConfirmation({
            confirmLabel: 'Proceed',
            description: 'The action will continue only after confirmation.',
            title: 'Continue action?'
          }).then(onResult);
        }}
        type="button"
      >
        Open confirmation
      </button>
    </AppConfirmationProvider>
  );
}

function TextInputDemo({ onResult }: { onResult: (value: string | null) => void }) {
  return (
    <AppConfirmationProvider>
      <button
        onClick={() => {
          void requestAppTextInput({
            confirmLabel: 'Save',
            inputLabel: 'Source website',
            placeholder: 'https://example.com/article',
            title: 'Add source website'
          }).then(onResult);
        }}
        type="button"
      >
        Open text input
      </button>
    </AppConfirmationProvider>
  );
}

it('resolves confirmation requests from the shared app dialog', async () => {
  const onResult = vi.fn();
  renderWithLocalization(<ConfirmationDemo onResult={onResult} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
  const dialog = await screen.findByRole('dialog', { name: 'Continue action?' });
  expect(within(dialog).getByText('The action will continue only after confirmation.')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Proceed' }));

  await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
});

it('resolves text input requests from the shared app dialog', async () => {
  const onResult = vi.fn();
  renderWithLocalization(<TextInputDemo onResult={onResult} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open text input' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add source website' });
  fireEvent.change(within(dialog).getByLabelText('Source website'), {
    target: { value: 'https://source.example/article' }
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onResult).toHaveBeenCalledWith('https://source.example/article'));
});

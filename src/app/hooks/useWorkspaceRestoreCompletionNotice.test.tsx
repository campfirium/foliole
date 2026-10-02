import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../store/workspaceRestoreSession', () => ({ consumeWorkspaceRestoreCompletion: vi.fn() }));

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../shared/ui/AppConfirmationProvider';
import { consumeWorkspaceRestoreCompletion } from '../../store/workspaceRestoreSession';

import { useWorkspaceRestoreCompletionNotice } from './useWorkspaceRestoreCompletionNotice';

function RestoredWorkspace({ hydrated }: { hydrated: boolean }) {
  useWorkspaceRestoreCompletionNotice(hydrated);
  return null;
}

beforeEach(() => vi.mocked(consumeWorkspaceRestoreCompletion).mockReset());

it('waits for hydration and keeps successful restoration visible until dismissed', async () => {
  vi.mocked(consumeWorkspaceRestoreCompletion).mockReturnValueOnce('selected.db').mockReturnValue(null);
  const view = renderWithLocalization(<AppConfirmationProvider><RestoredWorkspace hydrated={false} /></AppConfirmationProvider>);
  expect(consumeWorkspaceRestoreCompletion).not.toHaveBeenCalled();
  view.rerender(<AppConfirmationProvider><RestoredWorkspace hydrated /></AppConfirmationProvider>);
  expect(await screen.findByRole('dialog')).toHaveTextContent('The backup selected.db has been restored.');
  view.rerender(<AppConfirmationProvider><div>Rebuilt workspace</div></AppConfirmationProvider>);
  expect(screen.getByRole('dialog')).toHaveTextContent('selected.db');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

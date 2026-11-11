import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

vi.mock('../../shared/platform/runtime', () => ({ isDesktopRuntime: () => true }));

it('sends the current article from the desktop right-click menu without a selection', () => {
  const onRunCommand = vi.fn();
  render(
    <WebLookupSelectionMenu
      canSendToEdge
      documentText="Complete article"
      left={16}
      onClose={vi.fn()}
      onRunCommand={onRunCommand}
      top={24}
    />
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Send Article to Edge' }));
  expect(onRunCommand).toHaveBeenCalledExactlyOnceWith(APP_COMMAND_IDS.sendToEdge);
});

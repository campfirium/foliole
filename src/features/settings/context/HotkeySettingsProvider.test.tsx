import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { HotkeySettingsProvider, useHotkeySettings } from './HotkeySettingsProvider';

function RequestHarness() {
  const hotkeys = useHotkeySettings();
  return (
    <>
      <button onClick={() => hotkeys.onConfigureShortcut('workspace.createFolder')} type="button">Request</button>
      <button onClick={hotkeys.onRequestedCommandConsumed} type="button">Consume</button>
      <span>{hotkeys.requestedCommandId ?? 'none'}</span>
    </>
  );
}

it('keeps shortcut configuration targets as consumable provider-local UI state', () => {
  render(
    <HotkeySettingsProvider hotkeyItems={[]} onHotkeyReset={vi.fn()} onHotkeyResetAll={vi.fn()} onHotkeyUpdate={() => ({ status: 'blocked' })}>
      <RequestHarness />
    </HotkeySettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Request' }));
  expect(screen.getByText('workspace.createFolder')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Consume' }));
  expect(screen.getByText('none')).toBeInTheDocument();
});

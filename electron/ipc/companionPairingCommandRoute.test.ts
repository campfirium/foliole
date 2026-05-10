// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

const commandMocks = vi.hoisted(() => ({
  handleCompanionPairingCommand: vi.fn(() => ({ routed: true }))
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  }
}));
vi.mock('./companionPairingCommands.js', () => commandMocks);
vi.mock('./importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand: vi.fn() }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));

it('routes companion pairing commands before falling through to unsupported commands', async () => {
  await expect(handleInvokeRequest({ command: 'set_desktop_as_primary_device' })).resolves.toEqual({ routed: true });
  expect(commandMocks.handleCompanionPairingCommand).toHaveBeenCalledWith('set_desktop_as_primary_device', {});
});

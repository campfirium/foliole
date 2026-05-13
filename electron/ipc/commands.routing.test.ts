// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';

import { buildCommandRouteMap, COMMAND_ROUTE_ENTRIES, resolveCommandRoute } from './commandRoutes.js';
import { handleInvokeRequest } from './commands.js';

const { handleImportCommand, handleReviewCommand, handleStorageCommand, handleWindowAndUtilityCommand } = vi.hoisted(
  () => ({
    handleImportCommand: vi.fn(),
    handleReviewCommand: vi.fn(),
    handleStorageCommand: vi.fn(),
    handleWindowAndUtilityCommand: vi.fn()
  })
);

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  }
}));

vi.mock('./importCommands.js', () => ({ handleImportCommand }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand }));

describe('native command route registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves every native command to exactly one handler family', () => {
    const commands = Object.values(NATIVE_COMMANDS);
    const registeredCommands = new Set(COMMAND_ROUTE_ENTRIES.map((entry) => entry.command));

    expect(registeredCommands.size).toBe(commands.length);
    for (const command of commands) {
      expect(resolveCommandRoute(command)).not.toBeNull();
    }
  });

  it('rejects duplicate route registrations', () => {
    const command = NATIVE_COMMANDS.appGetVersion;

    expect(() =>
      buildCommandRouteMap(
        [
          { command, family: 'windowAndUtility' },
          { command, family: 'storage' }
        ],
        [command]
      )
    ).toThrow(`duplicate native command route: ${command}`);
  });

  it('rejects missing route registrations', () => {
    const command = NATIVE_COMMANDS.appGetVersion;

    expect(() => buildCommandRouteMap([], [command])).toThrow(`missing native command route: ${command}`);
  });

  it('fails clearly for unsupported commands', async () => {
    await expect(handleInvokeRequest({ command: 'missing_command' })).rejects.toThrow(
      'unsupported native command: missing_command'
    );
  });

  it('does not fall back to another family when a routed family misses internally', async () => {
    handleImportCommand.mockResolvedValue(undefined);

    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.runTextFileImport })).rejects.toThrow(
      `unsupported native command: ${NATIVE_COMMANDS.runTextFileImport}`
    );
    expect(handleImportCommand).toHaveBeenCalledTimes(1);
    expect(handleStorageCommand).not.toHaveBeenCalled();
    expect(handleWindowAndUtilityCommand).not.toHaveBeenCalled();
    expect(handleReviewCommand).not.toHaveBeenCalled();
  });
});

const _routeEntriesAreNativeCommands: readonly NativeCommandName[] = COMMAND_ROUTE_ENTRIES.map((entry) => entry.command);
void _routeEntriesAreNativeCommands;

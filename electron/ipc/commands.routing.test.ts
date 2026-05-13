// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';
import {
  beginDatabaseStartup,
  markDatabaseReady,
  markDatabaseStartupFailed,
  resetDatabaseReadinessForTests
} from '../database/databaseReadiness.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  resetDatabaseReadinessForTests();
});

describe('native command route registry', () => {
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

describe('database readiness routing', () => {
  it('waits for database readiness before dispatching database-backed routes', async () => {
    beginDatabaseStartup();
    handleStorageCommand.mockResolvedValue('ready-result');

    const result = handleInvokeRequest({ command: NATIVE_COMMANDS.loadAppSettingsState });
    await Promise.resolve();

    expect(handleStorageCommand).not.toHaveBeenCalled();
    markDatabaseReady();
    await expect(result).resolves.toBe('ready-result');
    expect(handleStorageCommand).toHaveBeenCalledTimes(1);
  });

  it('lets window and boot diagnostic commands bypass database readiness', async () => {
    beginDatabaseStartup();
    handleWindowAndUtilityCommand.mockResolvedValueOnce('version');
    handleReviewCommand.mockResolvedValueOnce('reported');

    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.appGetVersion })).resolves.toBe('version');
    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.bootReport })).resolves.toBe('reported');

    expect(handleWindowAndUtilityCommand).toHaveBeenCalledTimes(1);
    expect(handleReviewCommand).toHaveBeenCalledTimes(1);
  });

  it('rejects database-backed routes after database startup failure', async () => {
    beginDatabaseStartup();
    const result = handleInvokeRequest({ command: NATIVE_COMMANDS.loadAppSettingsState });
    markDatabaseStartupFailed(new Error('migration exploded'));

    await expect(result).rejects.toThrow('migration exploded');
    expect(handleStorageCommand).not.toHaveBeenCalled();
  });
});

const _routeEntriesAreNativeCommands: readonly NativeCommandName[] = COMMAND_ROUTE_ENTRIES.map((entry) => entry.command);
void _routeEntriesAreNativeCommands;

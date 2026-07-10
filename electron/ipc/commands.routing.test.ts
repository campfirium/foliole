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
import {
  buildCommandSecurityCapabilityMap,
  COMMAND_SECURITY_CAPABILITY_ENTRIES,
  isHighImpactNativeCommand,
  resolveCommandSecurityCapability
} from './commandSecurityCapabilities.js';

const { handleAssistantCommand, handleImportCommand, handleReviewCommand, handleStorageCommand, handleWindowAndUtilityCommand } = vi.hoisted(
  () => ({
    handleAssistantCommand: vi.fn(),
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

vi.mock('./assistantCommands.js', () => ({ handleAssistantCommand }));
vi.mock('./importCommands.js', () => ({ handleImportCommand }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand }));

const HIGH_IMPACT_COMMANDS = [
  NATIVE_COMMANDS.deleteNodesPermanently,
  NATIVE_COMMANDS.restoreSqliteDatabase,
  NATIVE_COMMANDS.backupSqliteDatabase,
  NATIVE_COMMANDS.applySyncNodes,
  NATIVE_COMMANDS.applySyncObjects,
  NATIVE_COMMANDS.recordSyncNodeConflicts,
  NATIVE_COMMANDS.resetImportData,
  NATIVE_COMMANDS.updateLibraryPathSetting,
  NATIVE_COMMANDS.saveBackupSettings,
  NATIVE_COMMANDS.saveExternalSearchFolders,
  NATIVE_COMMANDS.saveSyncPeers,
  NATIVE_COMMANDS.clearCompanionPairedDevices,
  NATIVE_COMMANDS.removeCompanionPairedDevice,
  NATIVE_COMMANDS.restoreSourceDispositions,
  NATIVE_COMMANDS.resetSourceDispositions,
  NATIVE_COMMANDS.runReadwiseImportCleanup,
  NATIVE_COMMANDS.runReadwiseReaderImport,
  NATIVE_COMMANDS.runClipboardImport,
  NATIVE_COMMANDS.runDirectoryImport,
  NATIVE_COMMANDS.runTextFileImport,
  NATIVE_COMMANDS.importExternalSearchDocument,
  NATIVE_COMMANDS.openExternalDocumentFile,
  NATIVE_COMMANDS.openLocalPath,
  NATIVE_COMMANDS.openExternalUrl,
  NATIVE_COMMANDS.importClipboardImageAttachment,
  NATIVE_COMMANDS.importLocalImageAttachment,
  NATIVE_COMMANDS.importRemoteImageAttachment,
  NATIVE_COMMANDS.exportAttachmentImage,
  NATIVE_COMMANDS.copyAttachmentImageToClipboard,
  NATIVE_COMMANDS.saveRemoteImageSourceOrigin,
  NATIVE_COMMANDS.clearLinkPanelBrowsingData
] as const satisfies readonly NativeCommandName[];

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

  it('routes legacy assistant history removal aliases to the assistant handler only', async () => {
    beginDatabaseStartup();
    handleAssistantCommand.mockResolvedValue('removed');

    await expect(handleInvokeRequest({ command: 'assistant_delete_thread_index' })).resolves.toBe('removed');

    expect(handleAssistantCommand).toHaveBeenCalledWith('assistant_delete_thread_index', {}, undefined);
    expect(handleStorageCommand).not.toHaveBeenCalled();
  });

});

describe('native command security capability inventory', () => {
  it('resolves every native command to exactly one security capability', () => {
    const commands = Object.values(NATIVE_COMMANDS);
    const registeredCommands = new Set(COMMAND_SECURITY_CAPABILITY_ENTRIES.map((entry) => entry.command));

    expect(registeredCommands.size).toBe(commands.length);
    for (const command of commands) {
      expect(resolveCommandSecurityCapability(command)).not.toBeNull();
    }
  });

  it('rejects duplicate security capability registrations', () => {
    const command = NATIVE_COMMANDS.appGetVersion;

    expect(() =>
      buildCommandSecurityCapabilityMap(
        [
          { command, capability: 'diagnostic' },
          { command, capability: 'read' }
        ],
        [command]
      )
    ).toThrow(`duplicate native command security capability: ${command}`);
  });

  it('rejects missing security capability registrations', () => {
    const command = NATIVE_COMMANDS.appGetVersion;

    expect(() => buildCommandSecurityCapabilityMap([], [command])).toThrow(
      `missing native command security capability: ${command}`
    );
  });

  it('keeps highest-impact commands out of read, diagnostic, and window control buckets', () => {
    for (const command of HIGH_IMPACT_COMMANDS) {
      expect(isHighImpactNativeCommand(command), command).toBe(true);
      expect(resolveCommandSecurityCapability(command), command).not.toMatch(/^(read|diagnostic|windowControl)$/);
    }
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

  it('lets window, assistant, and boot diagnostic commands bypass database readiness', async () => {
    beginDatabaseStartup();
    handleWindowAndUtilityCommand.mockResolvedValueOnce('version');
    handleAssistantCommand.mockResolvedValueOnce('assistant-status');
    handleReviewCommand.mockResolvedValueOnce('reported');

    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.appGetVersion })).resolves.toBe('version');
    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.assistantGetStatus })).resolves.toBe('assistant-status');
    await expect(handleInvokeRequest({ command: NATIVE_COMMANDS.bootReport })).resolves.toBe('reported');

    expect(handleWindowAndUtilityCommand).toHaveBeenCalledTimes(1);
    expect(handleAssistantCommand).toHaveBeenCalledTimes(1);
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

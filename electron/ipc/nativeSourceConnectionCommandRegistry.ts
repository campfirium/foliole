import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_SOURCE_CONNECTION_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.removeExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.disconnectExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.previewExternalSearchFolderReconnect, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.reconnectExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.loadReadwiseDeviceAssignment, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.activateReadwiseOnThisDevice, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.loadWatchedFolderBindings, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.previewWatchedFolderReconnect, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.confirmWatchedFolderReconnect, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.disconnectWatchedFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.removeWatchedFolder, route: 'storage', capability: 'settingsMutation' }
] as const;

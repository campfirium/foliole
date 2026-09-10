import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_SOURCE_CONNECTION_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.prepareReadwiseManualSearch, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.searchReadwiseManualSources, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.importReadwiseManualSource, route: 'storage', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.previewSourceManagement, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.confirmSourceManagement, route: 'storage', capability: 'destructiveMutation' },
  { command: NATIVE_COMMANDS.removeExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.disconnectExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.previewExternalSearchFolderReconnect, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.reconnectExternalSearchFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.loadReadwiseHostAssignment, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.activateReadwiseOnThisHost, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.loadReadwiseApiConnection, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.loadReadwiseApiScheduleStatus, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.connectReadwiseApiFromClipboard, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.disconnectReadwiseApi, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.previewReadwiseIdentityBindings, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.confirmReadwiseIdentityBindings, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.previewReadwiseSourceCutover, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.runReadwiseSourceCutover, route: 'storage', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.loadWatchedFolderBindings, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.previewWatchedFolderReconnect, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.confirmWatchedFolderReconnect, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.disconnectWatchedFolder, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.removeWatchedFolder, route: 'storage', capability: 'settingsMutation' }
] as const;

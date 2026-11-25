import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_SYSTEM_SETTINGS_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.openGlobalCaptureAccessibilitySettings, route: 'windowAndUtility', capability: 'externalOpen' },
  { command: NATIVE_COMMANDS.openImportPermissionSettings, route: 'windowAndUtility', capability: 'externalOpen' },
  { command: NATIVE_COMMANDS.openSyncGroupLocalNetworkSettings, route: 'windowAndUtility', capability: 'externalOpen' },
  { command: NATIVE_COMMANDS.openWindowsDefaultAppSettings, route: 'windowAndUtility', capability: 'externalOpen' }
] as const;

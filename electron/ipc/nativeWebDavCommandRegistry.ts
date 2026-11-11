import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import type { NativeCommandRegistryEntry } from './nativeCommandRegistry.js';

export const NATIVE_WEBDAV_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.openWebDavRelayLog, route: 'storage', capability: 'filesystemOpen' },
  { command: NATIVE_COMMANDS.enableWebDavRelay, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.confirmWebDavCredentialDelivery, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.loadWebDavRelayDirectory, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.loadWebDavSetupDraft, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.saveWebDavSetupDraft, route: 'storage', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.saveWebDavRelayDirectory, route: 'storage', capability: 'settingsMutation' },
] as const satisfies readonly NativeCommandRegistryEntry[];

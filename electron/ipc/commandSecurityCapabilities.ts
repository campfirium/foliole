import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';

import { NATIVE_COMMAND_REGISTRY } from './nativeCommandRegistry.js';

export type CommandSecurityCapability =
  | 'assistant'
  | 'clipboardWrite'
  | 'dataMutation'
  | 'destructiveMutation'
  | 'diagnostic'
  | 'externalOpen'
  | 'filesystemOpen'
  | 'filesystemWrite'
  | 'importMutation'
  | 'read'
  | 'restoreMutation'
  | 'settingsMutation'
  | 'syncMutation'
  | 'windowControl';

export interface CommandSecurityCapabilityEntry {
  command: NativeCommandName;
  capability: CommandSecurityCapability;
}

const HIGH_IMPACT_SECURITY_CAPABILITIES = new Set<CommandSecurityCapability>([
  'clipboardWrite',
  'dataMutation',
  'destructiveMutation',
  'externalOpen',
  'filesystemOpen',
  'filesystemWrite',
  'importMutation',
  'restoreMutation',
  'settingsMutation',
  'syncMutation'
]);

export const COMMAND_SECURITY_CAPABILITY_ENTRIES = NATIVE_COMMAND_REGISTRY.map(({ command, capability }) => ({
  command,
  capability
})) satisfies CommandSecurityCapabilityEntry[];

export function buildCommandSecurityCapabilityMap(
  entries: readonly CommandSecurityCapabilityEntry[],
  expectedCommands: readonly NativeCommandName[] = Object.values(NATIVE_COMMANDS)
): ReadonlyMap<NativeCommandName, CommandSecurityCapability> {
  const capabilities = new Map<NativeCommandName, CommandSecurityCapability>();
  for (const entry of entries) {
    if (capabilities.has(entry.command)) {
      throw new Error(`duplicate native command security capability: ${entry.command}`);
    }
    capabilities.set(entry.command, entry.capability);
  }
  for (const command of expectedCommands) {
    if (!capabilities.has(command)) {
      throw new Error(`missing native command security capability: ${command}`);
    }
  }
  return capabilities;
}

const COMMAND_SECURITY_CAPABILITY_MAP = buildCommandSecurityCapabilityMap(COMMAND_SECURITY_CAPABILITY_ENTRIES);

export function resolveCommandSecurityCapability(command: NativeCommandName) {
  return COMMAND_SECURITY_CAPABILITY_MAP.get(command) ?? null;
}

export function isHighImpactNativeCommand(command: NativeCommandName) {
  const capability = resolveCommandSecurityCapability(command);
  return capability ? HIGH_IMPACT_SECURITY_CAPABILITIES.has(capability) : false;
}

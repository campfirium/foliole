import { NATIVE_COMMANDS, type NativeCommandName } from '../../lib/platform/nativeCommands.js';

import { NATIVE_COMMAND_REGISTRY } from './nativeCommandRegistry.js';

export type CommandRouteFamily = 'assistant' | 'import' | 'review' | 'storage' | 'update' | 'windowAndUtility';

export interface CommandRouteEntry {
  command: NativeCommandName;
  family: CommandRouteFamily;
}

export const COMMAND_ROUTE_ENTRIES = NATIVE_COMMAND_REGISTRY.map(({ command, route }) => ({
  command,
  family: route
})) satisfies CommandRouteEntry[];

export function buildCommandRouteMap(
  entries: readonly CommandRouteEntry[],
  expectedCommands: readonly NativeCommandName[] = Object.values(NATIVE_COMMANDS)
): ReadonlyMap<NativeCommandName, CommandRouteFamily> {
  const routes = new Map<NativeCommandName, CommandRouteFamily>();
  for (const entry of entries) {
    if (routes.has(entry.command)) {
      throw new Error(`duplicate native command route: ${entry.command}`);
    }
    routes.set(entry.command, entry.family);
  }
  for (const command of expectedCommands) {
    if (!routes.has(command)) {
      throw new Error(`missing native command route: ${command}`);
    }
  }
  return routes;
}

const COMMAND_ROUTE_MAP = buildCommandRouteMap(COMMAND_ROUTE_ENTRIES);
const LEGACY_ASSISTANT_COMMAND_ROUTES = new Set(['assistant_delete_thread_index']);

export function resolveCommandRoute(command: string): CommandRouteFamily | null {
  if (LEGACY_ASSISTANT_COMMAND_ROUTES.has(command)) return 'assistant';
  return COMMAND_ROUTE_MAP.get(command as NativeCommandName) ?? null;
}

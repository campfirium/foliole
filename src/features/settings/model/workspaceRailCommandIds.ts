import { APP_COMMAND_IDS } from '../../../shared/commands/ids';

const LEGACY_WORKSPACE_RAIL_COMMAND_IDS: Partial<Record<string, string>> = {
  'desktop.command.openCommandPalette': APP_COMMAND_IDS.openCommandPalette,
  'desktop.command.openWorkspaceSearch': APP_COMMAND_IDS.openWorkspaceSearch
};

export function normalizeWorkspaceRailCommandId(commandId: string) {
  const normalizedCommandId = commandId.trim();
  return LEGACY_WORKSPACE_RAIL_COMMAND_IDS[normalizedCommandId] ?? normalizedCommandId;
}

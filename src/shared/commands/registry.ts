import { matchesShortcutSet } from './shortcuts';
import type { CommandContext, CommandPaletteItem, CommandRegistration, CommandStateItem } from './types';

export interface CommandRegistry {
  getCommandStates: () => CommandStateItem[];
  getPaletteItems: (query?: string) => CommandPaletteItem[];
  runById: (id: string) => boolean;
  runByShortcut: (event: KeyboardEvent) => boolean;
}

export function createCommandRegistry(commands: CommandRegistration[], getContext: () => CommandContext = () => ({})): CommandRegistry {
  const commandById = new Map(commands.map((command) => [command.id, command]));
  const getCommandStates = (): CommandStateItem[] =>
    commands.map((command) => ({
      id: command.id,
      enabled: command.isEnabled ? command.isEnabled(getContext()) : true
    }));

  const getPaletteItems = (query = ''): CommandPaletteItem[] => {
    const normalizedQuery = query.trim().toLowerCase();
    const statesById = new Map(getCommandStates().map((item) => [item.id, item.enabled]));
    return commands
      .filter((command) => command.palette !== false)
      .map((command) => ({
        id: command.id,
        title: command.title,
        section: command.section,
        keywords: command.keywords,
        shortcuts: command.shortcuts,
        enabled: statesById.get(command.id) ?? true
      }))
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        const haystack = [item.id, item.title, item.section, ...(item.keywords ?? [])].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  };

  const runById = (id: string) => {
    const command = commandById.get(id);
    if (!command) {
      return false;
    }
    const context = getContext();
    if (command.isEnabled && !command.isEnabled(context)) {
      return false;
    }
    return command.execute(context) !== false;
  };

  return {
    getCommandStates,
    getPaletteItems,
    runById,
    runByShortcut: (event) => {
      for (const command of commands) {
        if (!command.shortcuts || !matchesShortcutSet(event, command.shortcuts)) {
          continue;
        }
        event.preventDefault();
        if (!runById(command.id)) {
          continue;
        }
        return true;
      }
      return false;
    }
  };
}

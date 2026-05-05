import { matchesShortcut } from './shortcuts';
import type { CommandRegistration } from './types';

export interface CommandRegistry {
  runByShortcut: (event: KeyboardEvent) => boolean;
}

export function createCommandRegistry(commands: CommandRegistration[]): CommandRegistry {
  return {
    runByShortcut: (event) => {
      for (const command of commands) {
        if (!command.shortcut || !matchesShortcut(event, command.shortcut)) {
          continue;
        }
        if (command.isEnabled && !command.isEnabled()) {
          continue;
        }
        event.preventDefault();
        const handled = command.execute();
        if (handled === false) {
          continue;
        }
        return true;
      }
      return false;
    }
  };
}

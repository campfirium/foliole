export type CommandShortcutSlot = 'primary' | 'secondary';

export interface CommandShortcut {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface CommandShortcutSet {
  primary?: CommandShortcut;
  secondary?: CommandShortcut;
}

export interface CommandPaletteItem {
  id: string;
  title: string;
  section?: string;
  sectionId?: string;
  keywords?: string[];
  shortcuts?: CommandShortcutSet;
  enabled: boolean;
}

export interface CommandStateItem {
  id: string;
  enabled: boolean;
}

export interface CommandRegistration {
  id: string;
  title: string;
  section?: string;
  shortcutScope?: string;
  keywords?: string[];
  palette?: boolean;
  execute: (context: CommandContext) => boolean | void;
  isEnabled?: (context: CommandContext) => boolean;
  shortcuts?: CommandShortcutSet;
}

export interface CommandContext {
  [key: string]: boolean | number | string | null | undefined;
}

export interface CommandShortcut {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface CommandPaletteItem {
  id: string;
  title: string;
  section?: string;
  keywords?: string[];
  shortcut?: CommandShortcut;
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
  keywords?: string[];
  palette?: boolean;
  execute: (context: CommandContext) => boolean | void;
  isEnabled?: (context: CommandContext) => boolean;
  shortcut?: CommandShortcut;
}

export interface CommandContext {
  [key: string]: boolean | number | string | null | undefined;
}

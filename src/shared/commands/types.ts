export interface CommandShortcut {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface CommandRegistration {
  id: string;
  execute: () => boolean | void;
  isEnabled?: () => boolean;
  shortcut?: CommandShortcut;
}

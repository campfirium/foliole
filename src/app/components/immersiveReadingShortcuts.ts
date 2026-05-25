export interface ImmersiveReadingShortcut {
  ariaKeyShortcuts: string;
  key: string;
  summary: string;
}

export const IMMERSIVE_READING_SHORTCUTS: ImmersiveReadingShortcut[] = [
  { ariaKeyShortcuts: 'F11', key: 'F11', summary: 'Toggle immersive reading' },
  { ariaKeyShortcuts: 'ArrowDown', key: 'ArrowDown', summary: 'Select the next paragraph' },
  { ariaKeyShortcuts: 'ArrowUp', key: 'ArrowUp', summary: 'Select the previous paragraph' },
  { ariaKeyShortcuts: 'H', key: 'H', summary: 'Highlight the current paragraph' },
  { ariaKeyShortcuts: 'N', key: 'N', summary: 'Create a note from the current paragraph' },
  { ariaKeyShortcuts: 'Enter', key: 'Enter', summary: 'Temporarily switch into editing' },
  { ariaKeyShortcuts: '?', key: '?', summary: 'Show or hide this shortcut list' },
  { ariaKeyShortcuts: 'Escape', key: 'Esc', summary: 'Leave editing or exit immersive reading' }
];

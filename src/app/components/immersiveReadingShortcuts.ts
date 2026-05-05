export interface ImmersiveReadingShortcut {
  key: string;
  summary: string;
}

export const IMMERSIVE_READING_SHORTCUTS: ImmersiveReadingShortcut[] = [
  { key: 'F11', summary: 'Toggle immersive reading' },
  { key: 'Space / ArrowDown', summary: 'Select the next paragraph' },
  { key: 'Shift+Space / ArrowUp', summary: 'Select the previous paragraph' },
  { key: 'H', summary: 'Highlight the current paragraph' },
  { key: 'N', summary: 'Create a note from the current paragraph' },
  { key: 'Enter', summary: 'Temporarily switch into editing' },
  { key: '?', summary: 'Show or hide this shortcut list' },
  { key: 'Esc', summary: 'Leave editing or exit immersive reading' }
];

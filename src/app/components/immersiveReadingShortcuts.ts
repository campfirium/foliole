export interface ImmersiveReadingShortcut {
  ariaKeyShortcuts: string;
  key: string;
  summaryKey:
    | 'desktop.immersiveShortcuts.toggle'
    | 'desktop.immersiveShortcuts.nextParagraph'
    | 'desktop.immersiveShortcuts.previousParagraph'
    | 'desktop.immersiveShortcuts.highlightParagraph'
    | 'desktop.immersiveShortcuts.createNote'
    | 'desktop.immersiveShortcuts.editTemporarily'
    | 'desktop.immersiveShortcuts.toggleList'
    | 'desktop.immersiveShortcuts.exit';
}

export const IMMERSIVE_READING_SHORTCUTS: ImmersiveReadingShortcut[] = [
  { ariaKeyShortcuts: 'F11', key: 'F11', summaryKey: 'desktop.immersiveShortcuts.toggle' },
  { ariaKeyShortcuts: 'Space', key: 'Space', summaryKey: 'desktop.immersiveShortcuts.nextParagraph' },
  { ariaKeyShortcuts: 'Shift+Space', key: 'Shift+Space', summaryKey: 'desktop.immersiveShortcuts.previousParagraph' },
  { ariaKeyShortcuts: 'ArrowDown', key: 'ArrowDown', summaryKey: 'desktop.immersiveShortcuts.nextParagraph' },
  { ariaKeyShortcuts: 'ArrowUp', key: 'ArrowUp', summaryKey: 'desktop.immersiveShortcuts.previousParagraph' },
  { ariaKeyShortcuts: 'H', key: 'H', summaryKey: 'desktop.immersiveShortcuts.highlightParagraph' },
  { ariaKeyShortcuts: 'N', key: 'N', summaryKey: 'desktop.immersiveShortcuts.createNote' },
  { ariaKeyShortcuts: 'Enter', key: 'Enter', summaryKey: 'desktop.immersiveShortcuts.editTemporarily' },
  { ariaKeyShortcuts: '?', key: '?', summaryKey: 'desktop.immersiveShortcuts.toggleList' },
  { ariaKeyShortcuts: 'Escape', key: 'Esc', summaryKey: 'desktop.immersiveShortcuts.exit' }
];

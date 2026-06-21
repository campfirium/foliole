import { canUseBrowserReservedAppShortcuts } from '../../shared/platform/browserReservedShortcuts';

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

const IMMERSIVE_READING_TOGGLE_SHORTCUT: ImmersiveReadingShortcut = {
  ariaKeyShortcuts: 'F11',
  key: 'F11',
  summaryKey: 'desktop.immersiveShortcuts.toggle'
};

const IMMERSIVE_READING_MODE_SHORTCUTS: ImmersiveReadingShortcut[] = [
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

export function getImmersiveReadingShortcuts() {
  return canUseBrowserReservedAppShortcuts()
    ? [IMMERSIVE_READING_TOGGLE_SHORTCUT, ...IMMERSIVE_READING_MODE_SHORTCUTS]
    : IMMERSIVE_READING_MODE_SHORTCUTS;
}

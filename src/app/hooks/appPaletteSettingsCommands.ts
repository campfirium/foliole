import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export interface AppPaletteSettingsCommandMeta {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
}

export const SETTINGS_PALETTE_COMMANDS: AppPaletteSettingsCommandMeta[] = [
  { id: APP_COMMAND_IDS.openSettings, title: 'Open Settings', section: 'Settings' },
  {
    id: APP_COMMAND_IDS.openCustomCopy,
    title: 'Open Custom Copy',
    section: 'Settings',
    keywords: ['settings', 'copy', 'text', 'translation', 'localization']
  },
  {
    id: APP_COMMAND_IDS.openReadwiseReaderSettings,
    title: 'Open Readwise Reader Settings',
    section: 'Settings',
    keywords: ['settings', 'readwise', 'reader', 'import', 'library']
  },
  {
    id: APP_COMMAND_IDS.toggleBaseColorMode,
    title: 'Cycle Appearance Mode',
    section: 'Settings',
    keywords: ['appearance', 'theme', 'dark', 'light', 'system', 'color', 'mode']
  },
  {
    id: APP_COMMAND_IDS.setPdfDarkAppearanceOriginal,
    title: 'Use Original PDF in Dark Mode',
    section: 'Settings',
    keywords: ['pdf', 'appearance', 'dark', 'original']
  },
  {
    id: APP_COMMAND_IDS.setPdfDarkAppearanceInverted,
    title: 'Use Inverted PDF in Dark Mode',
    section: 'Settings',
    keywords: ['pdf', 'appearance', 'dark', 'inverted']
  },
  {
    id: APP_COMMAND_IDS.setPdfDarkAppearanceWarm,
    title: 'Use Warm PDF in Dark Mode',
    section: 'Settings',
    keywords: ['pdf', 'appearance', 'dark', 'warm']
  },
  { id: APP_COMMAND_IDS.closeSettings, title: 'Close Settings', section: 'Settings' }
];

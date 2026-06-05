import type { TranslationKey } from '../../../shared/localization/translations';

import type { HotkeyFilterMode } from './HotkeySettingsSectionModel';

export const HOTKEY_FILTER_OPTIONS: Array<{ labelKey: TranslationKey; value: HotkeyFilterMode }> = [
  { labelKey: 'settings.hotkeys.filter.all', value: 'all' },
  { labelKey: 'settings.hotkeys.filter.assigned', value: 'assigned' },
  { labelKey: 'settings.hotkeys.filter.customized', value: 'customized' },
  { labelKey: 'settings.hotkeys.filter.unassigned', value: 'unassigned' }
];

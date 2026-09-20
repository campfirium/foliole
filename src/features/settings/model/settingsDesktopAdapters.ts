import type { ReactNode } from 'react';

import type { Translate } from '../../../shared/localization/LocalizationProvider';

import type { DocumentHeaderMenuItemConfig } from './documentHeaderMenuSettings';

export interface SettingsDesktopAdapters {
  renderRailItemIcon(commandId: string, iconId?: string): ReactNode;
  resolveDocumentMenuLabel(item: DocumentHeaderMenuItemConfig, t: Translate): string;
}

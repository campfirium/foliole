import type { SettingsDesktopAdapters } from '../../features/settings/model/settingsDesktopAdapters';
import { APP_PALETTE_COMMANDS } from '../hooks/appPaletteCommandList';
import { localizePaletteCommandTitle } from '../hooks/appPaletteCommandLocalization';

import { RailItemIcon } from './WorkspaceRailActions';

export const settingsDesktopAdapters: SettingsDesktopAdapters = {
  renderRailItemIcon(commandId, iconId) {
    return <RailItemIcon commandId={commandId} {...(iconId ? { iconId } : {})} />;
  },
  resolveDocumentMenuLabel(item, t) {
    const command = APP_PALETTE_COMMANDS.find((candidate) => candidate.id === item.commandId);
    return item.labelOverride ?? localizePaletteCommandTitle(item.commandId, command?.title ?? item.commandId, t);
  }
};

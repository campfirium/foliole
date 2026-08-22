import {
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY,
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  parseSystemEntryDisplayNamesValueJson
} from '../../lib/platform/systemEntryDisplayNameContract';
import { setSystemEntryDisplayNames } from '../shared/localization/systemEntryDisplayNamesStore';
import { loadCompanionSyncSettingValueJson } from '../shared/platform/companionSyncObjects';

export async function hydrateCompanionSystemEntryDisplayNames() {
  const valueJson = await loadCompanionSyncSettingValueJson(
    SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
    SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId
  );
  return setSystemEntryDisplayNames(
    valueJson
      ? parseSystemEntryDisplayNamesValueJson(valueJson)
      : { customDisplayNameById: {}, version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION }
  );
}

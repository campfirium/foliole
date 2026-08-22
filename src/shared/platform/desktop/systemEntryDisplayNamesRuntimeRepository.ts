import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import {
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  parseSystemEntryDisplayNamesPayload,
  type SystemEntryDisplayNamesPayload
} from '../../../../lib/platform/systemEntryDisplayNameContract';
import { setSystemEntryDisplayNames } from '../../localization/systemEntryDisplayNamesStore';
import { getRuntimeInvoke } from '../runtimeInvoke';

const DEMO_STORAGE_KEY = 'foliole-demo-system-entry-display-names-v1';
const EMPTY_PAYLOAD: SystemEntryDisplayNamesPayload = {
  customDisplayNameById: {},
  version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
};

export async function hydrateRuntimeSystemEntryDisplayNames() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return setSystemEntryDisplayNames(EMPTY_PAYLOAD);
  return setSystemEntryDisplayNames(await invoke(NATIVE_COMMANDS.loadSystemEntryDisplayNames));
}

export function hydrateDemoSystemEntryDisplayNames() {
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  return setSystemEntryDisplayNames(raw ? JSON.parse(raw) : EMPTY_PAYLOAD);
}

export async function saveRuntimeSystemEntryDisplayNames(
  value: unknown,
  options: { demo: boolean }
) {
  const payload = parseSystemEntryDisplayNamesPayload(value);
  if (options.demo) {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(payload));
    return setSystemEntryDisplayNames(payload);
  }
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('system_entry_display_names_runtime_unavailable');
  return setSystemEntryDisplayNames(
    await invoke(NATIVE_COMMANDS.saveSystemEntryDisplayNames, { payload })
  );
}

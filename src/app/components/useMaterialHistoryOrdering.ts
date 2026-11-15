import { useEffect, useRef, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../../shared/platform/appSettingsState';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { MATERIAL_HISTORY_LIMIT } from './materialHistory';

interface Ordering {
  pins: string[];
  lastEdited: string | undefined;
}

function readPins(value?: string): string[] {
  try {
    const pins: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(pins) ? pins.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function useMaterialHistoryOrdering() {
  const scope = useWorkspaceStore((state) => state.libraryScope);
  const [loaded, setLoaded] = useState<{ scope: typeof scope; ordering: Ordering }>();
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void loadRuntimeAppSettingsState().then((settings) => {
      if (active && settings) setLoaded({ scope, ordering: {
        pins: readPins(settings[APP_SETTINGS_STORAGE_KEYS.materialHistoryPins]),
        lastEdited: settings[APP_SETTINGS_STORAGE_KEYS.materialHistoryLastEdit]
      } });
    });
    return () => { active = false; };
  }, [scope]);
  const ordering = loaded?.scope === scope ? loaded?.ordering : undefined;

  async function togglePin(id: string) {
    if (!ordering || pending.current) return true;
    const pins = ordering.pins.includes(id) ? ordering.pins.filter((pin) => pin !== id) : [...ordering.pins, id];
    if (pins.length > MATERIAL_HISTORY_LIMIT) return false;
    pending.current = true;
    try {
      const saved = await saveRuntimeAppSettingsState({ [APP_SETTINGS_STORAGE_KEYS.materialHistoryPins]: JSON.stringify(pins) });
      if (saved && useWorkspaceStore.getState().libraryScope === scope) {
        setLoaded({ scope, ordering: { ...ordering, pins } });
      }
      return saved;
    } finally {
      pending.current = false;
    }
  }

  return { ordering, togglePin };
}

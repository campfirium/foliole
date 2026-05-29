import { useEffect, useState } from 'react';

import {
  DEFAULT_COMPANION_TAB_CONFIG,
  type CompanionTabConfig
} from './CompanionTabsConfig';

const STORAGE_KEY = 'foliole-companion-tabs-config';

export function normalizeCompanionTabConfig(): CompanionTabConfig {
  return DEFAULT_COMPANION_TAB_CONFIG;
}

function readCompanionTabConfig(): CompanionTabConfig {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (rawValue) JSON.parse(rawValue);
    return DEFAULT_COMPANION_TAB_CONFIG;
  } catch {
    return DEFAULT_COMPANION_TAB_CONFIG;
  }
}

export function useCompanionTabsConfig() {
  const [config, setConfig] = useState<CompanionTabConfig>(readCompanionTabConfig);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  return {
    config,
    setConfig: () => setConfig(normalizeCompanionTabConfig())
  };
}

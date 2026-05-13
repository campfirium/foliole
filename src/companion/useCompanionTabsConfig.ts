import { useEffect, useState } from 'react';

import { parseLiteralUnion } from '../shared/lib/parseLiteralUnion';

import {
  COMPANION_SECONDARY_DESTINATIONS,
  DEFAULT_COMPANION_TAB_CONFIG,
  type CompanionSecondaryDestinationId,
  type CompanionTabConfig,
  type CompanionTabSlotId
} from './CompanionTabsConfig';

const STORAGE_KEY = 'foliole-companion-tabs-config';
const DEFAULT_ORDER = DEFAULT_COMPANION_TAB_CONFIG.orderedTabIds;
const SECONDARY_DESTINATION_ID_VALUES = COMPANION_SECONDARY_DESTINATIONS.map((destination) => destination.id);
const TAB_SLOT_ID_VALUES = ['browse', 'learn', 'search', 'settings', 'shortcut'] as const;

function isTabSlotId(value: unknown): value is CompanionTabSlotId {
  return parseLiteralUnion(value, TAB_SLOT_ID_VALUES) !== null;
}

function isSecondaryDestinationId(value: unknown): value is CompanionSecondaryDestinationId {
  return parseLiteralUnion(value, SECONDARY_DESTINATION_ID_VALUES) !== null;
}

export function normalizeCompanionTabConfig(value: unknown): CompanionTabConfig {
  if (!value || typeof value !== 'object') return DEFAULT_COMPANION_TAB_CONFIG;
  const raw = value as Partial<CompanionTabConfig>;
  const sanitizedOrder = Array.isArray(raw.orderedTabIds)
    ? raw.orderedTabIds.filter(isTabSlotId)
    : DEFAULT_ORDER;
  const orderedTabIds = Array.from(new Set(sanitizedOrder));
  const completeOrder = [
    ...orderedTabIds,
    ...DEFAULT_ORDER.filter((tabId) => !orderedTabIds.includes(tabId))
  ];
  const shortcut = raw.shortcut && typeof raw.shortcut === 'object'
    ? raw.shortcut as Partial<CompanionTabConfig['shortcut']>
    : {};
  return {
    orderedTabIds: completeOrder.length === DEFAULT_ORDER.length ? completeOrder : DEFAULT_ORDER,
    shortcut: {
      destinationId: isSecondaryDestinationId(shortcut.destinationId) ? shortcut.destinationId : 'directory',
      enabled: shortcut.enabled === true
    }
  };
}

function readCompanionTabConfig(): CompanionTabConfig {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    return rawValue ? normalizeCompanionTabConfig(JSON.parse(rawValue)) : DEFAULT_COMPANION_TAB_CONFIG;
  } catch {
    return DEFAULT_COMPANION_TAB_CONFIG;
  }
}

export function useCompanionTabsConfig() {
  const [config, setConfig] = useState<CompanionTabConfig>(readCompanionTabConfig);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  return { config, setConfig };
}

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

export const PUBLISHING_SECTION_IDS = ['foliole', 'wordpress', 'discourse'] as const;

export type PublishingSectionId = typeof PUBLISHING_SECTION_IDS[number];
export type PublishingSectionExpansion = Record<PublishingSectionId, boolean>;

export const DEFAULT_PUBLISHING_SECTION_EXPANSION: PublishingSectionExpansion = {
  discourse: false,
  foliole: false,
  wordpress: false
};

const STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.publishingExpandedSections;

export function loadPublishingSectionExpansion(): PublishingSectionExpansion {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PUBLISHING_SECTION_EXPANSION };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(PUBLISHING_SECTION_IDS.map((id) => [id, parsed[id] === true])) as PublishingSectionExpansion;
  } catch {
    return { ...DEFAULT_PUBLISHING_SECTION_EXPANSION };
  }
}

export function savePublishingSectionExpansion(expansion: PublishingSectionExpansion) {
  if (PUBLISHING_SECTION_IDS.every((id) => !expansion[id])) {
    removeWhitelistedLocalStorageItem(STORAGE_KEY);
    return;
  }
  setWhitelistedLocalStorageItem(STORAGE_KEY, JSON.stringify(expansion));
}

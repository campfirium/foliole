import type {
  NativeAssistantModelCatalog,
  NativeAssistantModelOption,
  NativeAssistantModelSelection
} from '../../../lib/platform/nativeAssistantModelContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from './storage';

const FOLIOLE_AIDE_ENABLED_EVENT = 'foliole-aide-enabled-change';

export function getFolioleAideEnabled() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled) === 'true';
}

export function setFolioleAideEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, String(enabled));
  window.dispatchEvent(new CustomEvent(FOLIOLE_AIDE_ENABLED_EVENT, { detail: { enabled } }));
}

export function subscribeFolioleAideEnabled(listener: (enabled: boolean) => void) {
  const handler = (event: Event) => {
    listener(Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled));
  };
  window.addEventListener(FOLIOLE_AIDE_ENABLED_EVENT, handler);
  return () => window.removeEventListener(FOLIOLE_AIDE_ENABLED_EVENT, handler);
}

export function getFolioleAideFollowCurrentMaterial() {
  return getWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.folioleAideFollowCurrentMaterial
  ) !== 'false';
}

export function setFolioleAideFollowCurrentMaterial(enabled: boolean) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.folioleAideFollowCurrentMaterial,
    String(enabled)
  );
}

export function getFolioleAideModelSelection(): NativeAssistantModelSelection | null {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideModelSelection);
  if (!raw) return null;
  try {
    return parseModelSelection(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setFolioleAideModelSelection(selection: NativeAssistantModelSelection) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.folioleAideModelSelection,
    JSON.stringify(selection)
  );
}

function parseModelSelection(value: unknown): NativeAssistantModelSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selection = value as Partial<NativeAssistantModelSelection>;
  if (typeof selection.model !== 'string' || typeof selection.effort !== 'string') return null;
  if (selection.serviceTier !== null && typeof selection.serviceTier !== 'string') return null;
  return { effort: selection.effort, model: selection.model, serviceTier: selection.serviceTier };
}

export function resolveFolioleAideModelSelection(
  catalog: NativeAssistantModelCatalog,
  saved: NativeAssistantModelSelection | null
) {
  if (saved && isSelectionSupported(catalog, saved)) return saved;
  const defaultModel = catalog.models.find((model) => model.isDefault);
  return defaultModel ? defaultSelectionForModel(defaultModel) : null;
}

export function defaultSelectionForModel(
  model: NativeAssistantModelOption
): NativeAssistantModelSelection {
  return {
    effort: model.defaultReasoningEffort,
    model: model.model,
    serviceTier: model.defaultServiceTier
  };
}

function isSelectionSupported(
  catalog: NativeAssistantModelCatalog,
  selection: NativeAssistantModelSelection
) {
  const model = catalog.models.find((item) => item.model === selection.model);
  if (!model) return false;
  const effortSupported = model.supportedReasoningEfforts.some(
    (item) => item.effort === selection.effort
  );
  const serviceTierSupported = selection.serviceTier === null
    ? model.defaultServiceTier === null
    : model.serviceTiers.some((item) => item.id === selection.serviceTier);
  return effortSupported && serviceTierSupported;
}

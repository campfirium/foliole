import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  DEFAULT_NODE_ICON_STATE_APPEARANCE,
  getNodeIconStateAppearance,
  getNodeIconStateAppearanceStorageKeys,
  type NodeIconStateAppearance,
  type NodeIconStrokeStyle
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

function saveOptionalString(key: string, value: string) {
  if (value.trim().length === 0) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, value);
}

function saveOptionalSetting(key: string, value: string, fallback: string) {
  if (value === fallback) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, value);
}

function useStoredSvgSetting(key: string) {
  const [value, setValue] = useState(() => getWhitelistedLocalStorageItem(key) ?? '');
  return {
    set(nextValue: string) {
      setValue(nextValue);
      saveOptionalString(key, nextValue);
    },
    value
  };
}

function createInitialStateStyles(): Record<NodeTreeRowIconState, NodeIconStateAppearance> {
  return {
    pending: getNodeIconStateAppearance('pending'),
    scheduled: getNodeIconStateAppearance('scheduled'),
    dismissed: getNodeIconStateAppearance('dismissed')
  };
}

function useNodeIconStateStyleState() {
  const [stateStyles, setStateStyles] = useState<Record<NodeTreeRowIconState, NodeIconStateAppearance>>(createInitialStateStyles);

  const updateStateStyle = <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => {
    setStateStyles((current) => ({
      ...current,
      [state]: {
        ...current[state],
        [field]: value
      }
    }));
    const defaults = DEFAULT_NODE_ICON_STATE_APPEARANCE[state];
    const keys = getNodeIconStateAppearanceStorageKeys(state) as Partial<Record<keyof NodeIconStateAppearance, string>>;
    const key = keys[field];
    if (!key) {
      return;
    }
    saveOptionalSetting(key, String(value), String(defaults[field]));
  };

  return {
    reset() {
      setStateStyles(DEFAULT_NODE_ICON_STATE_APPEARANCE);
    },
    stateStyles,
    updateStateStyle
  };
}

function resetNodeIconSettingsStorage() {
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedStrokeStyle);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingDashLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedDashLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingGapLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledGapLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedGapLength);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow);
}

function createStateStyleActions(
  updateStateStyle: <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => void
) {
  return {
    setStateColor(state: NodeTreeRowIconState, value: string) {
      updateStateStyle(state, 'color', value);
    },
    setStateDashLength(state: NodeTreeRowIconState, value: number) {
      updateStateStyle(state, 'dashLength', value);
    },
    setStateGapLength(state: NodeTreeRowIconState, value: number) {
      updateStateStyle(state, 'gapLength', value);
    },
    setStateLineWidth(state: NodeTreeRowIconState, value: number) {
      updateStateStyle(state, 'lineWidth', value);
    },
    setStateStrokeStyle(state: NodeTreeRowIconState, value: NodeIconStrokeStyle) {
      updateStateStyle(state, 'strokeStyle', value);
    },
    setDismissedFadeEnabled(value: boolean) {
      updateStateStyle('dismissed', 'fadeEnabled', value);
    },
    setDismissedFadeOpacity(value: number) {
      updateStateStyle('dismissed', 'fadeOpacity', value);
    },
    setDismissedFadeWholeRow(value: boolean) {
      updateStateStyle('dismissed', 'fadeWholeRow', value);
    }
  };
}

export function useNodeIconSettingsState() {
  const topicSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
  const itemSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
  const styleState = useNodeIconStateStyleState();

  return {
    handleReset() {
      topicSvg.set('');
      itemSvg.set('');
      styleState.reset();
      resetNodeIconSettingsStorage();
    },
    itemSvg: itemSvg.value,
    setItemSvg: itemSvg.set,
    setTopicSvg: topicSvg.set,
    stateStyles: styleState.stateStyles,
    topicSvg: topicSvg.value,
    ...createStateStyleActions(styleState.updateStateStyle)
  };
}

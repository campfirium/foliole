import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  getDefaultNodeIconStateAppearance,
  getNodeIconStateAppearance,
  getNodeIconKindStateAppearanceStorageKey,
  type NodeIconStateAppearance,
  type NodeIconEffect
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type StateStyleMap = Record<NodeTreeRowIconState, Record<EditableIconKind, NodeIconStateAppearance>>;

function saveOptionalString(key: string, value: string) {
  if (value.trim().length === 0) {
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

function useStoredIconSetting(key: string) {
  const [value, setValue] = useState(() => getWhitelistedLocalStorageItem(key) ?? '');
  return {
    set(nextValue: string) {
      setValue(nextValue);
      saveOptionalString(key, nextValue);
    },
    value
  };
}

function createInitialStateStyles(): StateStyleMap {
  return {
    pending: {
      reading: getNodeIconStateAppearance('pending', 'reading'),
      review: getNodeIconStateAppearance('pending', 'review')
    },
    scheduled: {
      reading: getNodeIconStateAppearance('scheduled', 'reading'),
      review: getNodeIconStateAppearance('scheduled', 'review')
    },
    dismissed: {
      reading: getNodeIconStateAppearance('dismissed', 'reading'),
      review: getNodeIconStateAppearance('dismissed', 'review')
    }
  };
}

function useNodeIconStateStyleState() {
  const [stateStyles, setStateStyles] = useState<StateStyleMap>(createInitialStateStyles);

  const updateStateStyle = <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    kind: EditableIconKind,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => {
    setStateStyles((current) => {
      const nextAppearance = { ...current[state][kind], [field]: value };
      saveStateKindAppearance(state, kind, nextAppearance);
      return {
        ...current,
        [state]: {
          ...current[state],
          [kind]: nextAppearance
        }
      };
    });
  };

  return {
    reset() {
      setStateStyles({
        pending: {
          reading: getDefaultNodeIconStateAppearance('pending'),
          review: getDefaultNodeIconStateAppearance('pending')
        },
        scheduled: {
          reading: getDefaultNodeIconStateAppearance('scheduled'),
          review: getDefaultNodeIconStateAppearance('scheduled')
        },
        dismissed: {
          reading: getDefaultNodeIconStateAppearance('dismissed'),
          review: getDefaultNodeIconStateAppearance('dismissed')
        }
      });
    },
    stateStyles,
    updateStateStyle
  };
}

function isDefaultAppearance(state: NodeTreeRowIconState, kind: EditableIconKind, appearance: NodeIconStateAppearance) {
  const defaults = getDefaultNodeIconStateAppearance(state);
  return (Object.keys(defaults) as Array<keyof NodeIconStateAppearance>).every((field) => String(defaults[field]) === String(appearance[field]));
}

function saveStateKindAppearance(state: NodeTreeRowIconState, kind: EditableIconKind, appearance: NodeIconStateAppearance) {
  const key = getNodeIconKindStateAppearanceStorageKey(state, kind);
  if (isDefaultAppearance(state, kind, appearance)) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, JSON.stringify(appearance));
}

function resetNodeIconSettingsStorage() {
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryLucideIcon);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryLucideIcon);
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
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingTopicAppearance);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingItemAppearance);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledTopicAppearance);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance);
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedItemAppearance);
}

function createStateStyleActions(
  updateStateStyle: <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    kind: EditableIconKind,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => void
) {
  return {
    setStateColor(state: NodeTreeRowIconState, kind: EditableIconKind, value: string) {
      updateStateStyle(state, kind, 'color', value);
    },
    setStateDoubleLineDistance(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'doubleLineDistance', value);
    },
    setStateEffect(state: NodeTreeRowIconState, kind: EditableIconKind, value: NodeIconEffect) {
      updateStateStyle(state, kind, 'effect', value);
    },
    setStateLineWidth(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'lineWidth', value);
    },
    setStateSvg(state: NodeTreeRowIconState, kind: EditableIconKind, value: string) {
      updateStateStyle(state, kind, 'svg', value);
    },
    setDismissedFadeEnabled(kind: EditableIconKind, value: boolean) {
      updateStateStyle('dismissed', kind, 'fadeEnabled', value);
    },
    setDismissedFadeOpacity(kind: EditableIconKind, value: number) {
      updateStateStyle('dismissed', kind, 'fadeOpacity', value);
    },
    setDismissedFadeWholeRow(kind: EditableIconKind, value: boolean) {
      updateStateStyle('dismissed', kind, 'fadeWholeRow', value);
    }
  };
}

export function useNodeIconSettingsState() {
  const topicSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
  const itemSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
  const topicIcon = useStoredIconSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryLucideIcon);
  const itemIcon = useStoredIconSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryLucideIcon);
  const styleState = useNodeIconStateStyleState();

  return {
    handleReset() {
      topicSvg.set('');
      itemSvg.set('');
      topicIcon.set('');
      itemIcon.set('');
      styleState.reset();
      resetNodeIconSettingsStorage();
    },
    itemIcon: itemIcon.value,
    itemSvg: itemSvg.value,
    setItemIcon: itemIcon.set,
    setItemSvg: itemSvg.set,
    setTopicIcon: topicIcon.set,
    setTopicSvg: topicSvg.set,
    stateStyles: styleState.stateStyles,
    topicIcon: topicIcon.value,
    topicSvg: topicSvg.value,
    ...createStateStyleActions(styleState.updateStateStyle)
  };
}

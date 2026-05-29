import { useEffect } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import {
  type NodeIconStateAppearance,
  type NodeIconEffect
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { useNodeIconBaseAppearanceState } from './nodeIconBaseAppearanceSettingsState';
import { resetNodeIconSettingsStorage } from './nodeIconSettingsStorageReset';
import { useNodeIconStateAppearanceState } from './nodeIconStateAppearanceState';
import { useStoredIconSetting, useStoredSvgSetting } from './nodeIconStoredSettingState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type BaseAppearanceController = ReturnType<typeof useNodeIconBaseAppearanceState>;
type StoredStringController = ReturnType<typeof useStoredIconSetting>;
type StateAppearanceController = ReturnType<typeof useNodeIconStateAppearanceState>;

function createStateStyleActions(
  updateStateStyle: <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    kind: EditableIconKind,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => void,
  resetOne: (state: NodeTreeRowIconState, kind: EditableIconKind) => void
) {
  return {
    setStateColor(state: NodeTreeRowIconState, kind: EditableIconKind, value: string) {
      updateStateStyle(state, kind, 'color', value);
    },
    setStateEffect(state: NodeTreeRowIconState, kind: EditableIconKind, value: NodeIconEffect) {
      updateStateStyle(state, kind, 'effect', value);
    },
    setStateLineWidth(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'lineWidth', value);
    },
    setStateScale(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'scale', value);
    },
    setStateInnerLineWidth(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'innerLineWidth', value);
    },
    setStateInnerScale(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'innerScale', value);
    },
    setStateOuterLineWidth(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'outerLineWidth', value);
    },
    setStateOuterScale(state: NodeTreeRowIconState, kind: EditableIconKind, value: number) {
      updateStateStyle(state, kind, 'outerScale', value);
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
    setDismissedFadeTextOpacity(kind: EditableIconKind, value: number) {
      updateStateStyle('dismissed', kind, 'fadeTextOpacity', value);
    },
    resetStateAppearance(state: NodeTreeRowIconState, kind: EditableIconKind) {
      resetOne(state, kind);
    }
  };
}

function createBaseActions(args: {
  itemAppearance: BaseAppearanceController;
  itemIcon: StoredStringController;
  itemSvg: StoredStringController;
  stateState: StateAppearanceController;
  topicAppearance: BaseAppearanceController;
  topicIcon: StoredStringController;
  topicSvg: StoredStringController;
}) {
  const applyTopicBase = (fields: Partial<typeof args.topicAppearance.appearance>) => {
    args.stateState.applyBaseAppearance('reading', { ...args.topicAppearance.appearance, ...fields });
  };
  const applyItemBase = (fields: Partial<typeof args.itemAppearance.appearance>) => {
    args.stateState.applyBaseAppearance('review', { ...args.itemAppearance.appearance, ...fields });
  };
  return {
    setItemColor(value: string) {
      args.itemAppearance.setColor(value);
      applyItemBase({ color: value });
    },
    setItemIcon(value: string) {
      args.itemIcon.set(value);
      args.stateState.clearStateSvg('review');
    },
    setItemLineWidth(value: number) {
      args.itemAppearance.setLineWidth(value);
      applyItemBase({ lineWidth: value });
    },
    setItemScale(value: number) {
      args.itemAppearance.setScale(value);
      applyItemBase({ scale: value });
    },
    setItemSvg(value: string) {
      args.itemSvg.set(value);
      args.stateState.clearStateSvg('review');
    },
    setTopicColor(value: string) {
      args.topicAppearance.setColor(value);
      applyTopicBase({ color: value });
    },
    setTopicIcon(value: string) {
      args.topicIcon.set(value);
      args.stateState.clearStateSvg('reading');
    },
    setTopicLineWidth(value: number) {
      args.topicAppearance.setLineWidth(value);
      applyTopicBase({ lineWidth: value });
    },
    setTopicScale(value: number) {
      args.topicAppearance.setScale(value);
      applyTopicBase({ scale: value });
    },
    setTopicSvg(value: string) {
      args.topicSvg.set(value);
      args.stateState.clearStateSvg('reading');
    }
  };
}

export function useNodeIconSettingsState() {
  const topicSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg);
  const itemSvg = useStoredSvgSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg);
  const topicIcon = useStoredIconSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryLucideIcon);
  const itemIcon = useStoredIconSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryLucideIcon);
  const topicAppearance = useNodeIconBaseAppearanceState('reading');
  const itemAppearance = useNodeIconBaseAppearanceState('review');
  const styleState = useNodeIconStateAppearanceState();

  useEffect(() => {
    styleState.refreshInherited('reading');
  }, [styleState.refreshInherited, topicAppearance.appearance.color, topicAppearance.appearance.lineWidth, topicAppearance.appearance.scale]);

  useEffect(() => {
    styleState.refreshInherited('review');
  }, [itemAppearance.appearance.color, itemAppearance.appearance.lineWidth, itemAppearance.appearance.scale, styleState.refreshInherited]);

  return {
    handleReset() {
      topicSvg.set('');
      itemSvg.set('');
      topicIcon.set('');
      itemIcon.set('');
      topicAppearance.reset();
      itemAppearance.reset();
      styleState.reset();
      resetNodeIconSettingsStorage();
    },
    itemIcon: itemIcon.value,
    itemLineWidth: itemAppearance.appearance.lineWidth,
    itemScale: itemAppearance.appearance.scale,
    itemSvg: itemSvg.value,
    itemColor: itemAppearance.appearance.color,
    ...createBaseActions({ itemAppearance, itemIcon, itemSvg, stateState: styleState, topicAppearance, topicIcon, topicSvg }),
    stateStyles: styleState.stateStyles,
    topicIcon: topicIcon.value,
    topicLineWidth: topicAppearance.appearance.lineWidth,
    topicScale: topicAppearance.appearance.scale,
    topicColor: topicAppearance.appearance.color,
    topicSvg: topicSvg.value,
    ...createStateStyleActions(styleState.updateStateStyle, styleState.resetOne)
  };
}

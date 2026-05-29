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
    setItemColor: itemAppearance.setColor,
    setItemIcon: itemIcon.set,
    setItemLineWidth: itemAppearance.setLineWidth,
    setItemScale: itemAppearance.setScale,
    setItemSvg: itemSvg.set,
    setTopicColor: topicAppearance.setColor,
    setTopicIcon: topicIcon.set,
    setTopicLineWidth: topicAppearance.setLineWidth,
    setTopicScale: topicAppearance.setScale,
    setTopicSvg: topicSvg.set,
    stateStyles: styleState.stateStyles,
    topicIcon: topicIcon.value,
    topicLineWidth: topicAppearance.appearance.lineWidth,
    topicScale: topicAppearance.appearance.scale,
    topicColor: topicAppearance.appearance.color,
    topicSvg: topicSvg.value,
    ...createStateStyleActions(styleState.updateStateStyle, styleState.resetOne)
  };
}

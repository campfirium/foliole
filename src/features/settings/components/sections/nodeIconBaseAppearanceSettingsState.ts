import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import {
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  DEFAULT_NODE_ICON_BASE_APPEARANCE,
  getNodeIconBaseAppearance,
  type NodeIconBaseAppearance
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

const BASE_APPEARANCE_KEYS: Record<EditableIconKind, string> = {
  reading: APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryAppearance,
  review: APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryAppearance
};

function saveBaseAppearance(kind: EditableIconKind, appearance: NodeIconBaseAppearance) {
  const isDefault = Object.keys(DEFAULT_NODE_ICON_BASE_APPEARANCE).every(
    (key) => String(appearance[key as keyof NodeIconBaseAppearance]) === String(DEFAULT_NODE_ICON_BASE_APPEARANCE[key as keyof NodeIconBaseAppearance])
  );
  if (isDefault) {
    removeWhitelistedLocalStorageItem(BASE_APPEARANCE_KEYS[kind]);
    return;
  }
  setWhitelistedLocalStorageItem(BASE_APPEARANCE_KEYS[kind], JSON.stringify(appearance));
}

export function useNodeIconBaseAppearanceState(kind: EditableIconKind) {
  const [appearance, setAppearance] = useState(() => getNodeIconBaseAppearance(kind));
  return {
    appearance,
    reset() {
      setAppearance(DEFAULT_NODE_ICON_BASE_APPEARANCE);
      removeWhitelistedLocalStorageItem(BASE_APPEARANCE_KEYS[kind]);
    },
    setColor(color: string) {
      setAppearance((current) => {
        const next = { ...current, color };
        saveBaseAppearance(kind, next);
        return next;
      });
    },
    setLineWidth(lineWidth: number) {
      setAppearance((current) => {
        const next = { ...current, lineWidth };
        saveBaseAppearance(kind, next);
        return next;
      });
    },
    setScale(scale: number) {
      setAppearance((current) => {
        const next = { ...current, scale };
        saveBaseAppearance(kind, next);
        return next;
      });
    }
  };
}

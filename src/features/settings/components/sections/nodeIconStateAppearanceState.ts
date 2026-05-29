import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  getDefaultNodeIconStateAppearance,
  getNodeIconKindStateAppearanceStorageKey,
  getNodeIconStateAppearance,
  type NodeIconStateAppearance
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type StateStyleMap = Record<NodeTreeRowIconState, Record<EditableIconKind, NodeIconStateAppearance>>;
type StateStyleSetter = Dispatch<SetStateAction<StateStyleMap>>;

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

function saveStateKindAppearanceField<K extends keyof NodeIconStateAppearance>(
  state: NodeTreeRowIconState,
  kind: EditableIconKind,
  field: K,
  value: NodeIconStateAppearance[K]
) {
  const key = getNodeIconKindStateAppearanceStorageKey(state, kind);
  let override: Partial<NodeIconStateAppearance> = {};
  try {
    override = JSON.parse(getWhitelistedLocalStorageItem(key) ?? '{}') as Partial<NodeIconStateAppearance>;
  } catch {
    override = {};
  }
  setWhitelistedLocalStorageItem(key, JSON.stringify({ ...override, [field]: value }));
}

function saveStateKindAppearanceFields(
  state: NodeTreeRowIconState,
  kind: EditableIconKind,
  fields: Partial<NodeIconStateAppearance>
) {
  const key = getNodeIconKindStateAppearanceStorageKey(state, kind);
  let override: Partial<NodeIconStateAppearance> = {};
  try {
    override = JSON.parse(getWhitelistedLocalStorageItem(key) ?? '{}') as Partial<NodeIconStateAppearance>;
  } catch {
    override = {};
  }
  setWhitelistedLocalStorageItem(key, JSON.stringify({ ...override, ...fields }));
}

function applyBaseAppearanceToStates(
  setStateStyles: StateStyleSetter,
  kind: EditableIconKind,
  fields: Pick<NodeIconStateAppearance, 'color' | 'lineWidth' | 'scale'>
) {
  setStateStyles((current) => {
    const next = { ...current };
    (['pending', 'scheduled', 'dismissed'] as const).forEach((state) => {
      const nextAppearance = { ...current[state][kind], ...fields };
      saveStateKindAppearanceFields(state, kind, fields);
      next[state] = { ...next[state], [kind]: nextAppearance };
    });
    return next;
  });
}

function clearStateSvgFromStates(setStateStyles: StateStyleSetter, kind: EditableIconKind) {
  setStateStyles((current) => {
    const next = { ...current };
    (['pending', 'scheduled', 'dismissed'] as const).forEach((state) => {
      const nextAppearance = { ...current[state][kind], svg: '' };
      saveStateKindAppearanceField(state, kind, 'svg', '');
      next[state] = { ...next[state], [kind]: nextAppearance };
    });
    return next;
  });
}

export function useNodeIconStateAppearanceState() {
  const [stateStyles, setStateStyles] = useState<StateStyleMap>(createInitialStateStyles);
  const refreshInherited = useCallback((kind: EditableIconKind) => {
    setStateStyles((current) => {
      const next = { ...current };
      (['pending', 'scheduled', 'dismissed'] as const).forEach((state) => {
        if (getWhitelistedLocalStorageItem(getNodeIconKindStateAppearanceStorageKey(state, kind))) return;
        next[state] = { ...next[state], [kind]: getNodeIconStateAppearance(state, kind) };
      });
      return next;
    });
  }, []);

  const updateStateStyle = <K extends keyof NodeIconStateAppearance>(
    state: NodeTreeRowIconState,
    kind: EditableIconKind,
    field: K,
    value: NodeIconStateAppearance[K]
  ) => {
    setStateStyles((current) => {
      const nextAppearance = { ...current[state][kind], [field]: value };
      saveStateKindAppearanceField(state, kind, field, value);
      return { ...current, [state]: { ...current[state], [kind]: nextAppearance } };
    });
  };

  return {
    applyBaseAppearance(kind: EditableIconKind, fields: Pick<NodeIconStateAppearance, 'color' | 'lineWidth' | 'scale'>) {
      applyBaseAppearanceToStates(setStateStyles, kind, fields);
    },
    clearStateSvg(kind: EditableIconKind) {
      clearStateSvgFromStates(setStateStyles, kind);
    },
    refreshInherited,
    resetOne(state: NodeTreeRowIconState, kind: EditableIconKind) {
      removeWhitelistedLocalStorageItem(getNodeIconKindStateAppearanceStorageKey(state, kind));
      setStateStyles((current) => ({ ...current, [state]: { ...current[state], [kind]: getNodeIconStateAppearance(state, kind) } }));
    },
    reset() {
      setStateStyles({
        pending: { reading: getDefaultNodeIconStateAppearance('pending'), review: getDefaultNodeIconStateAppearance('pending') },
        scheduled: { reading: getDefaultNodeIconStateAppearance('scheduled'), review: getDefaultNodeIconStateAppearance('scheduled') },
        dismissed: { reading: getDefaultNodeIconStateAppearance('dismissed'), review: getDefaultNodeIconStateAppearance('dismissed') }
      });
    },
    stateStyles,
    updateStateStyle
  };
}

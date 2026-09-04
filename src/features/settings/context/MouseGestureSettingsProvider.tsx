import { useMemo, useState, type ReactNode } from 'react';

import type {
  EditorMouseGestureDirection,
  EditorMouseGestureId
} from '../../editor/model/editorMouseGestures';
import {
  addCustomEditorMouseGesture,
  getEditorMouseGestureSettings,
  resetEditorMouseGestureBindings,
  setEditorMouseGestureBinding,
  setEditorMouseGestureBoolean,
  setEditorMouseGestureSegmentThreshold,
  setEditorMouseGestureTrailColor,
  setEditorMouseGestureTrailLineWidth,
  setEditorMouseGestureTrailOpacity,
  setEditorMouseGestureTrailPointThreshold
} from '../../editor/model/editorMouseGestureSettings';

import {
  MouseGestureSettingsContext,
  useMouseGestureSettings
} from './mouseGestureSettingsContext';

function useMouseGestureSettingsState() {
  const [settings, setSettings] = useState(() => getEditorMouseGestureSettings());

  const syncSettings = () => {
    setSettings(getEditorMouseGestureSettings());
  };

  return useMemo(
    () => ({
      bindings: settings.bindings,
      settings,
      addCustomGesture: (directions: EditorMouseGestureDirection[], commandId: string) => {
        const added = addCustomEditorMouseGesture(directions, commandId);
        if (added) syncSettings();
        return added;
      },
      resetBindings: () => {
        resetEditorMouseGestureBindings();
        syncSettings();
      },
      setBinding: (gestureId: EditorMouseGestureId, commandId: string | null) => {
        setEditorMouseGestureBinding(gestureId, commandId);
        syncSettings();
      },
      setEnabled: (value: boolean) => {
        setEditorMouseGestureBoolean('enabled', value);
        syncSettings();
      },
      setHintVisible: (value: boolean) => {
        setEditorMouseGestureBoolean('hintVisible', value);
        syncSettings();
      },
      setSegmentThreshold: (value: number) => {
        setEditorMouseGestureSegmentThreshold(value);
        syncSettings();
      },
      setTrailColor: (value: string) => {
        setEditorMouseGestureTrailColor(value);
        syncSettings();
      },
      setTrailLineWidth: (value: number) => {
        setEditorMouseGestureTrailLineWidth(value);
        syncSettings();
      },
      setTrailOpacity: (value: number) => {
        setEditorMouseGestureTrailOpacity(value);
        syncSettings();
      },
      setTrailPointThreshold: (value: number) => {
        setEditorMouseGestureTrailPointThreshold(value);
        syncSettings();
      },
      setTrailVisible: (value: boolean) => {
        setEditorMouseGestureBoolean('trailVisible', value);
        syncSettings();
      }
    }),
    [settings]
  );
}

export function MouseGestureSettingsProvider({ children }: { children: ReactNode }) {
  const value = useMouseGestureSettingsState();
  return (
    <MouseGestureSettingsContext.Provider value={value}>
      {children}
    </MouseGestureSettingsContext.Provider>
  );
}

export { useMouseGestureSettings };

import { useMemo, useState, type ReactNode } from 'react';

import type { EditorMouseGestureId } from '../../editor/model/editorMouseGestures';
import {
  getEditorMouseGestureBindings,
  getEditorMouseGestureSettings,
  setEditorMouseGestureAction,
  setEditorMouseGestureSegmentThreshold,
  setEditorMouseGestureTrailColor,
  setEditorMouseGestureTrailLineWidth,
  setEditorMouseGestureTrailOpacity,
  setEditorMouseGestureTrailPointThreshold,
  type EditorMouseGestureActionSetting
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
      bindings: getEditorMouseGestureBindings(settings),
      settings,
      setAction: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => {
        setEditorMouseGestureAction(gestureId, action);
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
      }
    }),
    [settings]
  );
}

export function MouseGestureSettingsProvider({ children }: { children: ReactNode }) {
  const value = useMouseGestureSettingsState();
  return <MouseGestureSettingsContext.Provider value={value}>{children}</MouseGestureSettingsContext.Provider>;
}

export { useMouseGestureSettings };

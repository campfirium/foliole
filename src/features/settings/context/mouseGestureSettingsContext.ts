import { createContext, useContext } from 'react';

import type { EditorMouseGestureBinding, EditorMouseGestureId } from '../../editor/model/editorMouseGestures';
import type {
  EditorMouseGestureActionSetting,
  EditorMouseGestureSettings
} from '../../editor/model/editorMouseGestureSettings';

export interface MouseGestureSettingsContextValue {
  bindings: EditorMouseGestureBinding[];
  settings: EditorMouseGestureSettings;
  setAction: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => void;
  setSegmentThreshold: (value: number) => void;
  setTrailColor: (value: string) => void;
  setTrailLineWidth: (value: number) => void;
  setTrailOpacity: (value: number) => void;
  setTrailPointThreshold: (value: number) => void;
}

export const MouseGestureSettingsContext = createContext<MouseGestureSettingsContextValue | null>(null);

export function useMouseGestureSettings() {
  const context = useContext(MouseGestureSettingsContext);
  if (!context) {
    throw new Error('MouseGestureSettingsProvider is missing.');
  }
  return context;
}

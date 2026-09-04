import { createContext, useContext } from 'react';

import type {
  EditorMouseGestureBinding,
  EditorMouseGestureDirection,
  EditorMouseGestureId
} from '../../editor/model/editorMouseGestures';
import type { EditorMouseGestureSettings } from '../../editor/model/editorMouseGestureSettings';

export interface MouseGestureSettingsContextValue {
  bindings: EditorMouseGestureBinding[];
  settings: EditorMouseGestureSettings;
  addCustomGesture: (directions: EditorMouseGestureDirection[], commandId: string) => boolean;
  resetBindings: () => void;
  setBinding: (gestureId: EditorMouseGestureId, commandId: string | null) => void;
  setEnabled: (value: boolean) => void;
  setHintVisible: (value: boolean) => void;
  setSegmentThreshold: (value: number) => void;
  setTrailColor: (value: string) => void;
  setTrailLineWidth: (value: number) => void;
  setTrailOpacity: (value: number) => void;
  setTrailPointThreshold: (value: number) => void;
  setTrailVisible: (value: boolean) => void;
}

export const MouseGestureSettingsContext = createContext<MouseGestureSettingsContextValue | null>(
  null
);

export function useMouseGestureSettings() {
  const context = useContext(MouseGestureSettingsContext);
  if (!context) {
    throw new Error('MouseGestureSettingsProvider is missing.');
  }
  return context;
}

import type { EditorMouseGestureId } from '../../features/editor/model/editorMouseGestures';
import {
  getEditorMouseGestureSettings,
  setEditorMouseGestureAction,
  setEditorMouseGestureSegmentThreshold,
  setEditorMouseGestureTrailColor,
  setEditorMouseGestureTrailLineWidth,
  setEditorMouseGestureTrailOpacity,
  setEditorMouseGestureTrailPointThreshold,
  type EditorMouseGestureActionSetting,
  type EditorMouseGestureSettings
} from '../../features/editor/model/editorMouseGestureSettings';

interface MouseGestureLayoutState {
  mouseGestureSettings: EditorMouseGestureSettings;
  setMouseGestureSettingsState: (value: EditorMouseGestureSettings) => void;
}

export function createMouseGestureActions(mouseGestures: MouseGestureLayoutState) {
  const syncState = () => mouseGestures.setMouseGestureSettingsState(getEditorMouseGestureSettings());

  return {
    onMouseGestureActionChange: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => {
      setEditorMouseGestureAction(gestureId, action);
      syncState();
    },
    onMouseGestureTrailColorChange: (value: string) => {
      setEditorMouseGestureTrailColor(value);
      syncState();
    },
    onMouseGestureTrailLineWidthChange: (value: number) => {
      setEditorMouseGestureTrailLineWidth(value);
      syncState();
    },
    onMouseGestureTrailOpacityChange: (value: number) => {
      setEditorMouseGestureTrailOpacity(value);
      syncState();
    },
    onMouseGestureSegmentThresholdChange: (value: number) => {
      setEditorMouseGestureSegmentThreshold(value);
      syncState();
    },
    onMouseGestureTrailPointThresholdChange: (value: number) => {
      setEditorMouseGestureTrailPointThreshold(value);
      syncState();
    }
  };
}

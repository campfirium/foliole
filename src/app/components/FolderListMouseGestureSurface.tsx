import { useMemo, type MutableRefObject, type ReactNode } from 'react';

import {
  GestureDirectionHintOverlay,
  GestureTrailOverlay,
  buildGestureTrailPath
} from '../../features/editor/components/markdownEditorGestureTrail';
import { useEditorMouseGesture } from '../../features/editor/components/useEditorMouseGesture';
import { useMouseGestureSettings } from '../../features/settings/context/MouseGestureSettingsProvider';

export function FolderListMouseGestureSurface({
  children,
  surfaceRef
}: {
  children: ReactNode;
  surfaceRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const { bindings, settings } = useMouseGestureSettings();
  const gesture = useEditorMouseGesture(surfaceRef, bindings, settings);
  const trailPath = useMemo(
    () => buildGestureTrailPath(gesture.trail?.points ?? []),
    [gesture.trail?.points]
  );

  return (
    <div
      className="app-scrollbar relative flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2"
      data-folder-list-gesture-surface="true"
      onContextMenu={(event) => gesture.handleContextMenu(event)}
      onMouseDownCapture={gesture.handleMouseDownCapture}
      ref={surfaceRef}
    >
      {children}
      <GestureTrailOverlay path={trailPath} trail={gesture.trail} />
      <GestureDirectionHintOverlay
        commandTitle={gesture.activeCommandTitle}
        directions={gesture.directions}
        position={gesture.hintPosition}
      />
    </div>
  );
}

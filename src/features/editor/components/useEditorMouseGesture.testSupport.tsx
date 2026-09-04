import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { vi } from 'vitest';

import { PublicCommandProvider } from '../../../shared/commands/publicCommandContext';
import type { EditorMouseGestureBinding } from '../model/editorMouseGestures';
import { DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS } from '../model/editorMouseGestureSettings';

import { useEditorMouseGesture } from './useEditorMouseGesture';

const CUSTOM_BINDING: EditorMouseGestureBinding = {
  commandId: 'workspace.search',
  directions: ['left', 'right', 'up'],
  gesture: 'left-right-up',
  isCustom: true
};

export const UNBOUND_LEFT: EditorMouseGestureBinding = {
  commandId: null,
  directions: ['left'],
  gesture: 'left',
  isCustom: false
};

function GestureSurface(props: {
  bindings: EditorMouseGestureBinding[];
  enabled: boolean;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gesture = useEditorMouseGesture(hostRef, props.bindings, {
    ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
    enabled: props.enabled
  });
  return (
    <div
      data-directions={gesture.directions.join('-')}
      data-hint-position={gesture.hintPosition ? `${gesture.hintPosition.x},${gesture.hintPosition.y}` : ''}
      data-testid="surface"
      onContextMenu={(event) => gesture.handleContextMenu(event, props.onContextMenu)}
      onMouseDownCapture={gesture.handleMouseDownCapture}
      ref={hostRef}
    />
  );
}

export function renderGestureSurface(options: {
  bindings?: EditorMouseGestureBinding[];
  enabled?: boolean;
  runCommand?: (commandId: string) => void;
} = {}) {
  const onContextMenu = vi.fn<(event: React.MouseEvent<HTMLDivElement>) => void>();
  const runCommand = options.runCommand ?? vi.fn();
  const view = render(
    <PublicCommandProvider items={[]} runCommand={runCommand}>
      <GestureSurface
        bindings={options.bindings ?? [CUSTOM_BINDING]}
        enabled={options.enabled ?? true}
        onContextMenu={onContextMenu}
      />
    </PublicCommandProvider>
  );
  const surface = view.getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  return { ...view, onContextMenu, runCommand, surface };
}

export function dispatchWindowMouse(
  type: string,
  clientX: number,
  clientY: number,
  buttons = 2,
  button = 2
) {
  const event = new MouseEvent(type, {
    bubbles: true, button, buttons, cancelable: true, clientX, clientY
  });
  act(() => window.dispatchEvent(event));
  return event;
}

export function rightDown(surface: HTMLElement, clientX = 200, clientY = 200) {
  fireEvent.mouseDown(surface, { button: 2, buttons: 2, clientX, clientY });
}

export function rightClick(surface: HTMLElement, order: 'context-first' | 'mouseup-first') {
  rightDown(surface, 120, 140);
  if (order === 'context-first') fireEvent.contextMenu(surface, { clientX: 120, clientY: 140 });
  dispatchWindowMouse('mouseup', 120, 140, 0);
  if (order === 'mouseup-first') fireEvent.contextMenu(surface, { clientX: 120, clientY: 140 });
}

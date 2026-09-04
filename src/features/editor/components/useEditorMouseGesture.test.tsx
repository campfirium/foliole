import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

function GestureSurface(props: { enabled: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gesture = useEditorMouseGesture(hostRef, [CUSTOM_BINDING], {
    ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
    enabled: props.enabled
  });
  return (
    <div
      data-directions={gesture.directions.join('-')}
      data-testid="surface"
      onMouseDownCapture={gesture.handleMouseDownCapture}
      ref={hostRef}
    />
  );
}

function renderSurface(enabled: boolean, runCommand: (commandId: string) => void) {
  return render(
    <PublicCommandProvider items={[]} runCommand={runCommand}>
      <GestureSurface enabled={enabled} />
    </PublicCommandProvider>
  );
}

function move(type: string, clientX: number, clientY: number, buttons = 2) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 2, buttons, clientX, clientY }));
  });
}

describe('useEditorMouseGesture', () => {
  it('executes a three-segment custom binding through the public command runner', () => {
    const runCommand = vi.fn();
    const { getByTestId } = renderSurface(true, runCommand);
    fireEvent.mouseDown(getByTestId('surface'), { button: 2, buttons: 2, clientX: 200, clientY: 200 });
    move('mousemove', 160, 200);
    move('mousemove', 200, 200);
    move('mousemove', 200, 160);
    move('mouseup', 200, 160, 0);
    expect(runCommand).toHaveBeenCalledWith('workspace.search');
  });

  it('does not collect or execute gestures when disabled', () => {
    const runCommand = vi.fn();
    const { getByTestId } = renderSurface(false, runCommand);
    const surface = getByTestId('surface');
    fireEvent.mouseDown(surface, { button: 2, buttons: 2, clientX: 200, clientY: 200 });
    move('mousemove', 160, 200);
    move('mouseup', 160, 200, 0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute('data-directions', '');
  });
});

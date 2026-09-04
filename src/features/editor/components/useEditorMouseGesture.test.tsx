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
const UNBOUND_LEFT: EditorMouseGestureBinding = {
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
      data-testid="surface"
      onContextMenu={(event) => gesture.handleContextMenu(event, props.onContextMenu)}
      onMouseDownCapture={gesture.handleMouseDownCapture}
      ref={hostRef}
    />
  );
}

function renderSurface(options: {
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

function windowMouse(type: string, clientX: number, clientY: number, buttons = 2) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      button: 2,
      buttons,
      clientX,
      clientY
    }));
  });
}

function rightDown(surface: HTMLElement, clientX = 200, clientY = 200) {
  fireEvent.mouseDown(surface, { button: 2, buttons: 2, clientX, clientY });
}

function rightClick(surface: HTMLElement, order: 'context-first' | 'mouseup-first') {
  rightDown(surface, 120, 140);
  if (order === 'context-first') fireEvent.contextMenu(surface, { clientX: 120, clientY: 140 });
  windowMouse('mouseup', 120, 140, 0);
  if (order === 'mouseup-first') fireEvent.contextMenu(surface, { clientX: 120, clientY: 140 });
}

describe('useEditorMouseGesture', () => {
  it('opens a normal menu once after release when contextmenu arrives first', () => {
    const { onContextMenu, surface } = renderSurface();
    rightDown(surface, 120, 140);
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 120,
      clientY: 140
    });
    fireEvent(surface, contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(onContextMenu).not.toHaveBeenCalled();

    windowMouse('mouseup', 120, 140, 0);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]?.[0]).toMatchObject({ clientX: 120, clientY: 140 });
  });

  it('opens a normal menu once when contextmenu arrives after release', () => {
    const { onContextMenu, surface } = renderSurface();
    rightClick(surface, 'mouseup-first');
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('keeps movement below the direction threshold as a normal click', () => {
    const { onContextMenu, surface } = renderSurface();
    rightDown(surface);
    windowMouse('mousemove', 210, 200);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });
    windowMouse('mouseup', 210, 200, 0);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});

describe('useEditorMouseGesture intent', () => {
  it('locks gesture intent for an unbound direction and suppresses the menu', () => {
    const { onContextMenu, runCommand, surface } = renderSurface({ bindings: [UNBOUND_LEFT] });
    rightDown(surface);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });
    windowMouse('mousemove', 160, 200);
    windowMouse('mouseup', 160, 200, 0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('suppresses the menu for an unknown gesture sequence', () => {
    const { onContextMenu, runCommand, surface } = renderSurface({ bindings: [] });
    rightDown(surface);
    windowMouse('mousemove', 160, 200);
    windowMouse('mousemove', 160, 240);
    windowMouse('mousemove', 200, 240);
    windowMouse('mouseup', 200, 240, 0);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 240 });
    expect(runCommand).not.toHaveBeenCalled();
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('suppresses the menu even when the public runner produces no result', () => {
    const { onContextMenu, runCommand, surface } = renderSurface();
    rightDown(surface);
    windowMouse('mousemove', 160, 200);
    windowMouse('mousemove', 200, 200);
    windowMouse('mousemove', 200, 160);
    windowMouse('mouseup', 200, 160, 0);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 160 });
    expect(runCommand).toHaveBeenCalledWith('workspace.search');
    expect(onContextMenu).not.toHaveBeenCalled();
  });
});

describe('useEditorMouseGesture cleanup', () => {
  it.each(['blur', 'outside release', 'escape'])(
    'cleans %s state before the next normal right click',
    (reason) => {
      const { onContextMenu, surface } = renderSurface();
      rightDown(surface);
      fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });
      windowMouse('mousemove', 160, 200);
      if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      if (reason === 'outside release') windowMouse('mouseup', 500, 400, 0);
      if (reason === 'escape') {
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      }

      rightClick(surface, 'context-first');
      expect(onContextMenu).toHaveBeenCalledTimes(1);
    }
  );

  it('does not delay, collect, or execute when gestures are disabled', () => {
    const { onContextMenu, runCommand, surface } = renderSurface({ enabled: false });
    rightDown(surface);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    windowMouse('mousemove', 160, 200);
    windowMouse('mouseup', 160, 200, 0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute('data-directions', '');
  });
});

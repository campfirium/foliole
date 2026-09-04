import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { PublicCommandProvider } from '../../../shared/commands/publicCommandContext';
import type { EditorMouseGestureBinding } from '../model/editorMouseGestures';
import { DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS } from '../model/editorMouseGestureSettings';

import { useEditorMouseGesture } from './useEditorMouseGesture';

const BOUND_LEFT: EditorMouseGestureBinding = {
  commandId: APP_COMMAND_IDS.goBack,
  directions: ['left'],
  gesture: 'left',
  isCustom: false
};
const UNBOUND_LEFT = { ...BOUND_LEFT, commandId: null };

interface HarnessProps {
  bindings: EditorMouseGestureBinding[];
  enabled: boolean;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  runCommand: (commandId: string) => void;
}

function Surface(props: Omit<HarnessProps, 'runCommand'>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gesture = useEditorMouseGesture(hostRef, props.bindings, {
    ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
    enabled: props.enabled
  });
  return (
    <div
      data-testid="surface"
      onContextMenu={(event) => gesture.handleContextMenu(event, props.onContextMenu)}
      onMouseDownCapture={gesture.handleMouseDownCapture}
      ref={hostRef}
    />
  );
}

function Harness(props: HarnessProps) {
  return (
    <PublicCommandProvider items={[]} runCommand={props.runCommand}>
      <Surface {...props} />
    </PublicCommandProvider>
  );
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

function renderHarness() {
  const firstRunner = vi.fn();
  const onContextMenu = vi.fn();
  const props: HarnessProps = {
    bindings: [BOUND_LEFT],
    enabled: true,
    onContextMenu,
    runCommand: firstRunner
  };
  const view = render(<Harness {...props} />);
  const surface = view.getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  const update = (next: Partial<HarnessProps>) => view.rerender(<Harness {...props} {...next} />);
  return { ...view, firstRunner, onContextMenu, surface, update };
}

function rightDown(surface: HTMLElement) {
  fireEvent.mouseDown(surface, { button: 2, buttons: 2, clientX: 200, clientY: 200 });
}

function finishLeft(surface: HTMLElement) {
  windowMouse('mousemove', 150, 200);
  windowMouse('mouseup', 150, 200, 0);
  fireEvent.contextMenu(surface, { clientX: 150, clientY: 200 });
}

describe('useEditorMouseGesture rerender lifecycle', () => {
  it.each(['before', 'after'] as const)(
    'uses the latest command runner when it changes %s gesture intent',
    (timing) => {
      const { firstRunner, onContextMenu, surface, update } = renderHarness();
      const latestRunner = vi.fn();
      rightDown(surface);
      if (timing === 'after') windowMouse('mousemove', 150, 200);
      update({ runCommand: latestRunner });
      if (timing === 'before') windowMouse('mousemove', 150, 200);
      windowMouse('mouseup', 150, 200, 0);
      fireEvent.contextMenu(surface, { clientX: 150, clientY: 200 });

      expect(firstRunner).not.toHaveBeenCalled();
      expect(latestRunner).toHaveBeenCalledTimes(1);
      expect(latestRunner).toHaveBeenCalledWith(APP_COMMAND_IDS.goBack);
      expect(onContextMenu).not.toHaveBeenCalled();
    }
  );

  it('uses latest unbound state without reopening the menu', () => {
    const { firstRunner, onContextMenu, surface, update } = renderHarness();
    rightDown(surface);
    windowMouse('mousemove', 150, 200);
    update({ bindings: [UNBOUND_LEFT] });
    windowMouse('mouseup', 150, 200, 0);
    fireEvent.contextMenu(surface, { clientX: 150, clientY: 200 });

    expect(firstRunner).not.toHaveBeenCalled();
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('preserves a normal right click across an equivalent rerender', () => {
    const { onContextMenu, surface, update } = renderHarness();
    rightDown(surface);
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });
    update({ runCommand: vi.fn() });
    windowMouse('mouseup', 200, 200, 0);

    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('still cancels on disable and real surface unmount', () => {
    const disabled = renderHarness();
    rightDown(disabled.surface);
    windowMouse('mousemove', 150, 200);
    disabled.update({ enabled: false });
    finishLeft(disabled.surface);
    expect(disabled.firstRunner).not.toHaveBeenCalled();
    expect(disabled.onContextMenu).toHaveBeenCalledTimes(1);
    disabled.unmount();

    const unmounted = renderHarness();
    rightDown(unmounted.surface);
    windowMouse('mousemove', 150, 200);
    unmounted.unmount();
    windowMouse('mouseup', 150, 200, 0);
    expect(unmounted.firstRunner).not.toHaveBeenCalled();
  });
});

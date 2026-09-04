import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  dispatchWindowMouse as windowMouse,
  renderGestureSurface as renderSurface,
  rightClick,
  rightDown,
  UNBOUND_LEFT
} from './useEditorMouseGesture.testSupport';

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
  it('anchors feedback to the press point while the pointer keeps moving', () => {
    const { surface } = renderSurface({ bindings: [UNBOUND_LEFT] });
    rightDown(surface, 200, 180);
    const move = windowMouse('mousemove', 160, 180);
    expect(move.defaultPrevented).toBe(true);
    expect(surface).toHaveAttribute('data-hint-position', '200,180');
    windowMouse('mousemove', 120, 180);
    expect(surface).toHaveAttribute('data-hint-position', '200,180');
    expect(windowMouse('mouseup', 120, 180, 0).defaultPrevented).toBe(true);
  });

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

  it('executes a gesture started in the editor when release crosses its edge', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{ ...UNBOUND_LEFT, commandId: 'document.scrollBottom' }],
      runCommand
    });
    rightDown(surface, 40, 200);
    windowMouse('mousemove', -20, 200);
    windowMouse('mouseup', -20, 200, 0);
    expect(runCommand).toHaveBeenCalledWith('document.scrollBottom');
  });
});

describe('useEditorMouseGesture fast release sampling', () => {
  it('finishes when right-button state is released despite an unreliable button number', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{ ...UNBOUND_LEFT, commandId: 'workspace.goBack' }],
      runCommand
    });
    rightDown(surface, 200, 200);
    windowMouse('mousemove', 150, 200);
    windowMouse('mouseup', 150, 200, 0, 0);
    expect(runCommand).toHaveBeenCalledWith('workspace.goBack');
  });

  it('finishes an active gesture despite stale mouseup button-state fields', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{ ...UNBOUND_LEFT, commandId: 'workspace.goBack' }],
      runCommand
    });
    rightDown(surface, 200, 200);
    windowMouse('mousemove', 150, 200);
    windowMouse('mouseup', 150, 200, 2, 0);
    expect(runCommand).toHaveBeenCalledWith('workspace.goBack');
  });
});

describe('useEditorMouseGesture fast movement sampling', () => {
  it('does not discard a gesture when one fast move reports no pressed buttons', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{ ...UNBOUND_LEFT, commandId: 'workspace.goBack' }],
      runCommand
    });
    rightDown(surface, 200, 200);
    windowMouse('mousemove', 150, 200, 0);
    windowMouse('mouseup', 150, 200, 0);
    expect(runCommand).toHaveBeenCalledWith('workspace.goBack');
  });

  it('includes a fast final segment that arrives only with mouse release', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{
        commandId: 'document.scrollBottom',
        directions: ['left', 'down'],
        gesture: 'left-down',
        isCustom: false
      }],
      runCommand
    });
    rightDown(surface, 200, 200);
    windowMouse('mousemove', 150, 200);
    windowMouse('mouseup', 150, 250, 0);
    expect(runCommand).toHaveBeenCalledWith('document.scrollBottom');
  });

  it('recognizes a fast one-stroke gesture that first crosses the threshold on release', () => {
    const runCommand = vi.fn();
    const { surface } = renderSurface({
      bindings: [{ ...UNBOUND_LEFT, commandId: 'workspace.goBack' }],
      runCommand
    });
    rightDown(surface, 200, 200);
    windowMouse('mouseup', 150, 200, 0);
    expect(runCommand).toHaveBeenCalledWith('workspace.goBack');
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

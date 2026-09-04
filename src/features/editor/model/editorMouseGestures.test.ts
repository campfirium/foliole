import { describe, expect, it } from 'vitest';

import {
  BASE_EDITOR_MOUSE_GESTURES,
  normalizeEditorMouseGestureDirections,
  resolveEditorMouseGesture,
  resolveEditorMouseGestureCommand,
  validateCustomEditorMouseGesture
} from './editorMouseGestures';

describe('editorMouseGestures', () => {
  it('groups every one- and two-direction gesture by its first direction', () => {
    expect(BASE_EDITOR_MOUSE_GESTURES).toHaveLength(16);
    expect(BASE_EDITOR_MOUSE_GESTURES.map((item) => item.gesture)).toEqual([
      'up',
      'up-down',
      'up-left',
      'up-right',
      'down',
      'down-up',
      'down-left',
      'down-right',
      'left',
      'left-up',
      'left-down',
      'left-right',
      'right',
      'right-up',
      'right-down',
      'right-left'
    ]);
  });

  it('normalizes repeated movement and resolves basic or custom sequences', () => {
    expect(normalizeEditorMouseGestureDirections(['left', 'left', 'up', 'up'])).toEqual([
      'left',
      'up'
    ]);
    expect(resolveEditorMouseGesture(['down', 'left'])).toBe('down-left');
    const custom = [
      {
        commandId: 'workspace.openSearch',
        directions: ['left', 'right', 'up'] as const,
        gesture: 'left-right-up',
        isCustom: true
      }
    ];
    expect(
      resolveEditorMouseGesture(
        ['left', 'right', 'up'],
        custom.map((item) => ({ ...item, directions: [...item.directions] }))
      )
    ).toBe('left-right-up');
  });
});

describe('custom editor mouse gestures', () => {

  it('requires at least three segments and rejects complete sequence conflicts', () => {
    expect(validateCustomEditorMouseGesture(['left', 'up'], [])).toBe('too-short');
    expect(validateCustomEditorMouseGesture(['left', 'up', 'down'], [])).toBe('valid');
    expect(
      validateCustomEditorMouseGesture(
        ['left', 'up', 'down'],
        [
          {
            commandId: 'x',
            directions: ['left', 'up', 'down'],
            gesture: 'left-up-down',
            isCustom: true
          }
        ]
      )
    ).toBe('conflict');
  });

  it('resolves command ids without interpreting their semantics', () => {
    const bindings = [
      {
        commandId: 'unknown.command',
        directions: ['left'] as const,
        gesture: 'left',
        isCustom: false
      }
    ];
    expect(
      resolveEditorMouseGestureCommand(
        bindings.map((item) => ({ ...item, directions: [...item.directions] })),
        'left'
      )
    ).toBe('unknown.command');
    expect(resolveEditorMouseGestureCommand([], 'left')).toBeNull();
  });
});

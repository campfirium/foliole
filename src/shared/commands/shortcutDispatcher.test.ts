import { describe, expect, it } from 'vitest';

import { resolveCommandShortcutDispatch } from './shortcutDispatcher';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', { cancelable: true, ...init });
}

describe('resolveCommandShortcutDispatch', () => {
  it('returns the first enabled palette command matching the shortcut map', () => {
    expect(
      resolveCommandShortcutDispatch({
        event: keyEvent({ ctrlKey: true, key: 'l' }),
        items: [
          { id: 'workspace.disabled', enabled: false },
          { id: 'workspace.toggleList', enabled: true }
        ],
        shortcutMap: {
          'workspace.disabled': { primary: { ctrlKey: true, key: 'l' } },
          'workspace.toggleList': { primary: { ctrlKey: true, key: 'l' } }
        }
      })
    ).toBe('workspace.toggleList');
  });

  it('does not dispatch ignored or disabled commands', () => {
    expect(
      resolveCommandShortcutDispatch({
        event: keyEvent({ ctrlKey: true, key: 'l' }),
        ignoredCommandIds: ['workspace.toggleList'],
        items: [{ id: 'workspace.toggleList', enabled: true }],
        shortcutMap: {
          'workspace.toggleList': { primary: { ctrlKey: true, key: 'l' } }
        }
      })
    ).toBeNull();
  });

  it('ignores consumed, repeated, and composing events', () => {
    const consumed = keyEvent({ ctrlKey: true, key: 'l' });
    consumed.preventDefault();
    const args = {
      items: [{ id: 'workspace.toggleList', enabled: true }],
      shortcutMap: {
        'workspace.toggleList': { primary: { ctrlKey: true, key: 'l' } }
      }
    };

    expect(resolveCommandShortcutDispatch({ ...args, event: consumed })).toBeNull();
    expect(resolveCommandShortcutDispatch({ ...args, event: keyEvent({ ctrlKey: true, key: 'l', repeat: true }) })).toBeNull();
    expect(resolveCommandShortcutDispatch({ ...args, event: keyEvent({ ctrlKey: true, isComposing: true, key: 'l' }) })).toBeNull();
  });
});

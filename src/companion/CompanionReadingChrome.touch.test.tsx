import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingChrome } from './CompanionReadingChrome';

function touch(button: HTMLElement, type: string, x = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
  });
  fireEvent(button, event);
}

function renderActions(editing = false) {
  const activate = vi.fn();
  render(<ReadingChrome canEditContent isContentEditing={editing} onExit={activate}
    onOpenActions={activate} onOpenOutline={activate} onToggleContentEditing={activate} title="Topic" />);
  return activate;
}

describe('ReadingChrome touch actions', () => {
  it.each(['Exit', 'Outline', 'Edit topic', 'More reading actions', 'Cancel', 'Done'])(
    'activates %s from a short touch without a compatibility click', (label) => {
      const activate = renderActions(label === 'Cancel' || label === 'Done');
      const button = screen.getByRole('button', { name: label });
      touch(button, 'pointerdown');
      touch(button, 'pointerup');
      expect(activate).toHaveBeenCalledTimes(1);
    }
  );

  it('consumes the compatibility click once and preserves keyboard and mouse activation', () => {
    const activate = renderActions();
    const button = screen.getByRole('button', { name: 'Edit topic' });
    touch(button, 'pointerdown');
    touch(button, 'pointerup');
    fireEvent.click(button, { detail: 1 });
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.click(button, { detail: 0 });
    expect(activate).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    fireEvent.click(button, { detail: 1 });
    expect(activate).toHaveBeenCalledTimes(3);
  });

  it.each(['pointermove', 'pointercancel', 'long press'])(
    'does not activate from %s', (gesture) => {
      const activate = renderActions();
      const button = screen.getByRole('button', { name: 'Edit topic' });
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      touch(button, 'pointerdown');
      if (gesture === 'long press') now.mockReturnValue(1_600);
      else touch(button, gesture, 20);
      touch(button, 'pointerup');
      now.mockRestore();
      expect(activate).not.toHaveBeenCalled();
    }
  );
});

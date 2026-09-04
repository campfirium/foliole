import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';

import { MouseGestureCommandPicker } from './MouseGestureCommandPicker';

const COMMANDS = Array.from({ length: 40 }, (_, index) => ({
  enabled: true,
  id: `command-${index}`,
  title: `Command ${index}`
}));

function PickerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <LocalizationProvider>
      <MouseGestureCommandPicker
        commandId={null}
        commands={COMMANDS}
        gestureLabel="Up"
        onChange={() => undefined}
        onOpenChange={setOpen}
        open={open}
      />
    </LocalizationProvider>
  );
}

describe('MouseGestureCommandPicker', () => {
  it('scrolls the command list when the wheel is over the focused search field', () => {
    render(<PickerHarness />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Choose command for Up' }), {
      key: 'Enter'
    });
    const search = screen.getByLabelText('Filter commands');
    const list = document.querySelector('[data-mouse-gesture-command-list="true"]');
    if (!(list instanceof HTMLDivElement)) throw new Error('command list is unavailable');

    expect(list.scrollTop).toBe(0);
    fireEvent.wheel(search, { deltaY: 120 });
    expect(list.scrollTop).toBe(120);
  });
});

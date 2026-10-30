import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { CompanionSelectionToolbarActions } from './CompanionSelectionToolbarControls';

afterEach(() => { fireEvent.pointerDown(document.body); });

function ToolbarRoute({ underlying }: { underlying: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? <CompanionSelectionToolbarActions isExistingHighlight={false}
    onAddNote={() => {}} onDeleteExistingHighlight={() => {}}
    onApply={() => flushSync(() => setOpen(false))} />
    : <button onClick={underlying} type="button">Underlying action</button>;
}

it.each(['pointerdown', 'touchend'])('does not pass annotation %s through after the toolbar closes', type => {
  const underlying = vi.fn();
  render(<ToolbarRoute underlying={underlying} />);
  const highlight = screen.getByRole('button', { name: 'Highlight' });
  fireEvent(highlight, new Event(type, { bubbles: true, cancelable: true }));
  const action = screen.getByRole('button', { name: 'Underlying action' });
  fireEvent.click(action, { detail: 1 });
  expect(underlying).not.toHaveBeenCalled();
  fireEvent.pointerDown(action);
  fireEvent.click(action, { detail: 1 });
  expect(underlying).toHaveBeenCalledTimes(1);
});

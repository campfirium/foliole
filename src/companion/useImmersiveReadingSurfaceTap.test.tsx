import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { useImmersiveReadingSurfaceTap } from './useImmersiveReadingSurfaceTap';

function Surface() {
  const [visible, setVisible] = useState(false);
  const tap = useImmersiveReadingSurfaceTap(false, setVisible);
  return <section data-testid="surface" onClick={tap.handleSurfaceClick} onPointerDown={tap.handleSurfacePointerDown}
    onPointerMove={tap.handleSurfacePointerMove} onPointerUp={tap.handleSurfacePointerUp} onPointerCancel={tap.handleSurfacePointerCancel}>
    <p>Body</p><mark className="cm-md-highlight">Highlight</mark><a href="#topic">Link</a><button type="button">Action</button>
    {visible ? <span>Controls visible</span> : null}
  </section>;
}
function touch(target: HTMLElement, type: string, x = 40) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 200 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  fireEvent(target, event);
}
it('toggles once for a body short tap, leaving highlights, links and buttons alone', () => {
  render(<Surface />);
  const text = screen.getByText('Body');
  touch(text, 'pointerdown'); touch(text, 'pointerup'); fireEvent.click(text, { detail: 1 });
  expect(screen.getByText('Controls visible')).toBeInTheDocument();
  touch(text, 'pointerdown'); touch(text, 'pointerup'); fireEvent.click(text, { detail: 1 });
  expect(screen.queryByText('Controls visible')).not.toBeInTheDocument();
  for (const label of ['Highlight', 'Link', 'Action']) {
    const target = screen.getByText(label);
    touch(target, 'pointerdown'); touch(target, 'pointerup'); fireEvent.click(target, { detail: 1 });
    expect(screen.queryByText('Controls visible')).not.toBeInTheDocument();
  }
});
it.each(['swipe', 'long press', 'selection'])('does not reveal controls after %s and its compatibility click', gesture => {
  render(<Surface />);
  const target = screen.getByText('Body');
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const selection = vi.spyOn(window, 'getSelection');
  touch(target, 'pointerdown');
  if (gesture === 'long press') now.mockReturnValue(1600);
  if (gesture === 'swipe') touch(target, 'pointermove', 80);
  if (gesture === 'selection') selection.mockReturnValue({ isCollapsed: false } as Selection);
  touch(target, 'pointerup'); fireEvent.click(target, { detail: 1 });
  selection.mockRestore(); now.mockRestore();
  expect(screen.queryByText('Controls visible')).not.toBeInTheDocument();
});

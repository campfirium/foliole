import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useCompanionItemEditViewport } from './useCompanionItemEditViewport';

function Surface({ active }: { active: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useCompanionItemEditViewport(ref, active);
  return <section ref={ref} />;
}
afterEach(() => vi.unstubAllGlobals());

it('uses the visible keyboard viewport, follows its movement, and releases it on exit', () => {
  const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  const view = render(<Surface active={false} />);
  const surface = view.container.querySelector('section')!;
  surface.scrollTop = 160;
  view.rerender(<Surface active />);
  expect(surface.scrollTop).toBe(0);
  expect(surface.style.getPropertyValue('--companion-edit-viewport-height')).toBe('812px');
  act(() => { viewport.height = 380; viewport.offsetTop = 20; viewport.dispatchEvent(new Event('resize')); });
  expect(surface.style.getPropertyValue('--companion-edit-viewport-height')).toBe('380px');
  expect(surface.style.getPropertyValue('--companion-edit-viewport-top')).toBe('20px');
  view.rerender(<Surface active={false} />);
  expect(surface.scrollTop).toBe(160);
  expect(surface.style.getPropertyValue('--companion-edit-viewport-height')).toBe('');
  act(() => viewport.dispatchEvent(new Event('resize')));
  expect(surface.style.getPropertyValue('--companion-edit-viewport-height')).toBe('');
});

it('follows native window resize when there is no separate visual viewport', () => {
  vi.stubGlobal('visualViewport', undefined);
  vi.stubGlobal('innerHeight', 812);
  const view = render(<Surface active />);
  vi.stubGlobal('innerHeight', 380);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(view.container.querySelector('section')!.style.getPropertyValue('--companion-edit-viewport-height')).toBe('380px');
});

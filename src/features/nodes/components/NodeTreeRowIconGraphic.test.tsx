import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { NodeTreeRowIconGraphic } from './NodeTreeRowIconGraphic';
import { NodeTreeRowPresetIcon } from './NodeTreeRowPresetIcon';

const BASE_GRAPHIC_PROPS = {
  customMarkup: '',
  doubleLineDistance: 2,
  effect: 'double-line' as const,
  fallbackShape: 'hexagon' as const,
  iconId: '',
  innerLineWidth: 1.2,
  innerScale: 0.78,
  lineWidth: 1.2,
  outerLineWidth: 1.2,
  outerScale: 1.3,
  preview: true,
  scale: 1.15,
  transformMode: 'none' as const
};

it('keeps scheduled preset ring scales independent', () => {
  const { container } = render(<NodeTreeRowPresetIcon effect="double-line" innerLineWidth={0.6} outerLineWidth={0.6} outerScale={1.3} scale={1.15} shape="hexagon" />);

  const outer = container.querySelector('[data-node-icon-effect="double-line-outer"]');
  const inner = container.querySelector('[data-node-icon-effect="double-line-inner"]');
  expect(outer).toHaveAttribute(
    'transform',
    'translate(8 8) scale(1.3) translate(-8 -8)'
  );
  expect(inner).toHaveAttribute(
    'transform',
    'translate(8 8) scale(0.875) translate(-8 -8)'
  );
  expect(outer?.querySelector('polygon')).toHaveStyle({ strokeWidth: '0.6', vectorEffect: 'non-scaling-stroke' });
  expect(inner?.querySelector('polygon')).toHaveStyle({ strokeWidth: '0.6', vectorEffect: 'non-scaling-stroke' });
});

it('keeps scheduled custom ring scales independent', () => {
  const markup = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>';
  const { container } = render(<NodeTreeRowIconGraphic {...BASE_GRAPHIC_PROPS} customMarkup={markup} />);
  const layers = container.querySelectorAll('span[style*="scale"]');

  expect(layers[0]).toHaveStyle({ transform: 'scale(1.15)' });
  expect(layers[1]).toHaveStyle({ transform: 'scale(0.78)' });
  expect(layers[0]).toHaveStyle({ '--node-icon-stroke-width': `${1.2 / 1.15}` });
  expect(layers[1]).toHaveStyle({ '--node-icon-stroke-width': `${1.2 / 0.78}` });
});

it('keeps single preset stroke width independent from scale', () => {
  const { container } = render(<NodeTreeRowPresetIcon scale={1.3} shape="diamond" />);

  expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(8 8) scale(1.3) translate(-8 -8)');
  expect(container.querySelector('polygon')).toHaveStyle({ vectorEffect: 'non-scaling-stroke' });
});

it('keeps single custom stroke width independent from scale', () => {
  const markup = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>';
  const { container } = render(<NodeTreeRowIconGraphic {...BASE_GRAPHIC_PROPS} customMarkup={markup} effect="none" lineWidth={0.6} scale={1.3} />);
  const layer = container.querySelector('span[style*="scale"]');

  expect(layer).toHaveStyle({ transform: 'scale(1.3)' });
  expect(layer).toHaveStyle({ '--node-icon-stroke-width': `${0.6 / 1.3}` });
});

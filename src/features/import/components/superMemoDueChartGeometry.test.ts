import { expect, it } from 'vitest';

import { DUE_PLOT_HEIGHT, DUE_PLOT_WIDTH, dueTimelineWidth, makeDuePlot, nearestDuePeriodDistances } from './superMemoDueChartGeometry';

it('draws heights strictly proportional to their counts even when the range includes large peaks', () => {
  const plot = makeDuePlot(0, 73, 1871);
  const height = (count: number) => plot.y(0) - plot.y(count);
  expect(height(0)).toBe(0);
  expect(height(50) * 2).toBeCloseTo(height(100));
  expect(height(100) * 5).toBeCloseTo(height(500));
  expect(height(1)).toBeGreaterThan(0);
  expect(plot.ticks).toEqual([0, 500, 1000, 1500, 2000]);
});

it('puts each pair of bars edge to edge without clipping either end of the date range', () => {
  const plot = makeDuePlot(0, 1955, 1871);
  for (const day of [0, 1, 1955]) {
    const original = plot.bar(day, true);
    const planned = plot.bar(day, false);
    expect(original.left + original.width).toBeCloseTo(planned.left);
    expect(original.left).toBeGreaterThanOrEqual(0);
    expect(planned.left + planned.width).toBeLessThanOrEqual(DUE_PLOT_WIDTH);
    expect(plot.periodAt(planned.left)).toBe(day);
  }
});

it('uses an ordinary linear scale when small counts already have room to be visible', () => {
  const plot = makeDuePlot(0, 50, 16);
  expect(plot.y(0)).toBe(DUE_PLOT_HEIGHT);
  expect(plot.y(0) - plot.y(1)).toBeCloseTo(plot.y(8) - plot.y(9));
});

it('gives the oldest and newest calendar weeks the same mark width', () => {
  const plot = makeDuePlot(-30, 30, 10);
  expect(plot.bar(-30, true).width).toBe(plot.bar(12, true).width);
  expect(plot.periodAt(0)).toBe(-30);
  expect(plot.periodAt(DUE_PLOT_WIDTH)).toBe(30);
});

it('keeps adjacent calendar weeks from painting over each other in the full range', () => {
  const plot = makeDuePlot(0, 2000, 10);
  const spacing = nearestDuePeriodDistances([18, 19, 19, 2000]);
  const first = plot.bar(18, false, spacing.get(18));
  const second = plot.bar(19, true, spacing.get(19));
  expect(first.left + first.width).toBeLessThan(second.left);
  expect(plot.bar(2000, true, spacing.get(2000)).width).toBeGreaterThan(first.width);
});

it('shows 52 weeks initially at ordinary widths and reserves space for both bars', () => {
  expect(dueTimelineWidth(52)).toEqual({ width: '100%', minWidth: 260 });
  const full = dueTimelineWidth(104);
  expect(full).toEqual({ width: '200%', minWidth: 520 });
  const plot = makeDuePlot(0, 103, 10);
  const left = plot.bar(52, true, 1);
  const right = plot.bar(52, false, 1);
  expect(left.left + left.width).toBeCloseTo(right.left);
  expect(left.width / DUE_PLOT_WIDTH * full.minWidth).toBeGreaterThan(2);
});

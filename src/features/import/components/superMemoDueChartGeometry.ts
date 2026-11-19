export const DUE_PLOT_WIDTH = 1000;
export const DUE_PLOT_HEIGHT = 164;
const PLOT_PADDING = 3;
const VISIBLE_WEEKS = 52;
const MIN_WEEK_WIDTH = 5;

export function dueTimelineWidth(weekCount: number) {
  return {
    width: `${Math.max(1, weekCount / VISIBLE_WEEKS) * 100}%`,
    minWidth: weekCount * MIN_WEEK_WIDTH
  };
}

function quantityScale(maxCount: number) {
  const roughStep = Math.max(1, maxCount / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(factor => factor * magnitude >= roughStep) ?? 10) * magnitude;
  const max = Math.max(step, Math.ceil(maxCount / step) * step);
  return {
    ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step),
    y: (value: number) => DUE_PLOT_HEIGHT * (1 - value / max)
  };
}

export function makeDuePlot(first: number, last: number, maxCount: number) {
  const periodCount = last - first + 1;
  const periodWidth = (DUE_PLOT_WIDTH - 2 * PLOT_PADDING) / periodCount;
  const x = (period: number) => PLOT_PADDING + (period - first + 0.5) * periodWidth;
  const periodAt = (position: number) => {
    const period = first + Math.floor((position - PLOT_PADDING) / periodWidth);
    return Math.max(first, Math.min(last, period));
  };
  const bar = (period: number, original: boolean, nearestDistance = Infinity) => {
    const width = Math.min(21, Math.max(1.5, periodWidth * 0.44), periodWidth * nearestDistance * 0.48);
    return { left: x(period) - (original ? width : 0), width };
  };
  return { ...quantityScale(maxCount), periodAt, bar, periodCenter: x };
}

export function nearestDuePeriodDistances(dates: readonly number[]) {
  const sorted = [...new Set(dates)].sort((a, b) => a - b);
  return new Map(sorted.map((period, i) => [period,
    Math.min(period - (sorted[i - 1] ?? -Infinity), (sorted[i + 1] ?? Infinity) - period)
  ]));
}

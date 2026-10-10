import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const history = vi.hoisted(() => vi.fn(() => ({ failed: false, retry: () => {}, totalDurationMs: 120_000,
  duration: (day: string) => day === '2026-10-04' ? 70_000 : 0 })));
vi.mock('../features/review/components/useForegroundTimeHistory', () => ({ useForegroundTimeHistory: history }));
vi.mock('../shared/localization/LocalizationProvider', () => ({ useLocalization: () => ({ locale: 'en', t: (key: string) => key }) }));

import { CompanionForegroundTimeContent } from './CompanionForegroundTimeContent';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('shows mobile daily time, excludes future days and navigates back to the current month', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 4, 12));
  render(<CompanionForegroundTimeContent />);
  expect(screen.getByText('2026-10-04')).toBeVisible();
  expect(screen.getByText('1m')).toBeVisible();
  expect(screen.getByRole('status', { name: 'desktop.foregroundTime.total' })).toHaveTextContent('2m');
  expect(screen.queryByText('2026-10-05')).toBeNull();
  expect(screen.getByRole('button', { name: 'desktop.foregroundTime.next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'desktop.foregroundTime.previous' }));
  expect(history).toHaveBeenLastCalledWith('2026-09-01', '2026-10-01', '2026-10-04');
  expect(screen.getByRole('status', { name: 'desktop.foregroundTime.total' })).toHaveTextContent('2m');
  fireEvent.click(screen.getByRole('button', { name: 'desktop.foregroundTime.next' }));
  expect(history).toHaveBeenLastCalledWith('2026-10-01', '2026-11-01', '2026-10-04');
});

import { expect, it, vi } from 'vitest';

import { maintainContinuousMdnsQuery } from './continuousMdnsQuery.js';

it('retransmits an unanswered continuous mDNS query with exponential backoff', () => {
  vi.useFakeTimers();
  const browser = { services: [] as unknown[], update: vi.fn() };
  const query = maintainContinuousMdnsQuery(browser);

  vi.advanceTimersByTime(999);
  expect(browser.update).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(browser.update).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1_999);
  expect(browser.update).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(browser.update).toHaveBeenCalledTimes(2);

  query.stop();
  vi.runOnlyPendingTimers();
  expect(browser.update).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('suppresses known answers and restarts promptly after service withdrawal', () => {
  vi.useFakeTimers();
  const browser = { services: [{}], update: vi.fn() };
  const query = maintainContinuousMdnsQuery(browser);

  vi.advanceTimersByTime(3_000);
  expect(browser.update).not.toHaveBeenCalled();
  browser.services = [];
  query.refresh();
  expect(browser.update).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1_000);
  expect(browser.update).toHaveBeenCalledTimes(2);

  query.stop();
  vi.useRealTimers();
});

it('keeps querying when the browser has only an irrelevant local service', () => {
  vi.useFakeTimers();
  const browser = { services: [{ runtime: 'local' }], update: vi.fn() };
  const query = maintainContinuousMdnsQuery(
    browser, (service) => service.runtime === 'remote'
  );

  vi.advanceTimersByTime(1_000);
  expect(browser.update).toHaveBeenCalledOnce();
  browser.services.push({ runtime: 'remote' });
  vi.advanceTimersByTime(2_000);
  expect(browser.update).toHaveBeenCalledOnce();

  query.stop();
  vi.useRealTimers();
});

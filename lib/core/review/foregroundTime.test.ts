import { describe, expect, it } from 'vitest';

import { ForegroundTimeCounter } from './foregroundTime.js';

function clock(at = new Date(2026, 9, 4, 12).getTime()) {
  const time = { wallMs: at, monotonicMs: 0 };
  const counter = new ForegroundTimeCounter(() => ({ ...time }));
  function advance(ms: number) { time.wallMs += ms; time.monotonicMs += ms; }
  return { counter, time, advance };
}

describe('foreground duration', () => {
  it('counts passive reading once despite duplicate lifecycle notifications and ignores background time', () => {
    const { counter, advance } = clock();
    counter.setActive(true, 4); advance(30_000);
    counter.setActive(true, 4); advance(30_000);
    expect(counter.checkpoint()).toEqual([{ day: '2026-10-04', durationMs: 60_000 }]);
    counter.setActive(false, 4); counter.setActive(false, 4); advance(3_600_000);
    counter.setActive(true, 4); advance(10_000); counter.setActive(false, 4);
    expect(counter.snapshot()).toEqual([{ day: '2026-10-04', durationMs: 70_000 }]);
  });

  it('splits at the configured day boundary and shows a pending tail without double counting checkpoints', () => {
    const { counter, advance } = clock(new Date(2026, 9, 4, 3, 59, 30).getTime());
    counter.setActive(true, 4); advance(60_000);
    const expected = [{ day: '2026-10-03', durationMs: 30_000 }, { day: '2026-10-04', durationMs: 30_000 }];
    expect(counter.snapshot()).toEqual(expected);
    expect(counter.checkpoint()).toEqual(expected);
    expect(counter.snapshot()).toEqual(expected);
  });

  it('does not count clock jumps as additional elapsed time', () => {
    const { counter, time, advance } = clock();
    counter.setActive(true, 4); advance(60_000); time.wallMs += 3_600_000;
    expect(counter.checkpoint()).toEqual([{ day: '2026-10-04', durationMs: 60_000 }]);
    time.wallMs -= 7_200_000; advance(10_000);
    expect(counter.checkpoint()).toEqual([{ day: '2026-10-04', durationMs: 70_000 }]);
  });

  it('settles under the previous day boundary before applying a changed setting', () => {
    const { counter, advance } = clock(new Date(2026, 9, 4, 3).getTime());
    counter.setActive(true, 4); advance(60_000); counter.setActive(true, 0); advance(60_000);
    expect(counter.checkpoint()).toEqual([{ day: '2026-10-03', durationMs: 60_000 }, { day: '2026-10-04', durationMs: 60_000 }]);
  });
});

it('retains only saved time after an abrupt recording loss and does not recover the inactive gap', () => {
  const first = clock(); first.counter.setActive(true, 4); first.advance(60_000);
  const saved = first.counter.checkpoint(); first.advance(5_000);
  const reopened = clock(first.time.wallMs + 600_000);
  reopened.counter.setActive(true, 4); reopened.advance(10_000);
  expect(saved[0]!.durationMs + reopened.counter.snapshot()[0]!.durationMs).toBe(70_000);
});

it('splits at the same shifted local calendar boundary even on a daylight-saving transition day', () => {
  const boundary = new Date(2026, 2, 8).getTime() + 4 * 3_600_000;
  const { counter, advance } = clock(boundary - 30_000);
  counter.setActive(true, 4); advance(60_000);
  expect(counter.checkpoint()).toEqual([{ day: '2026-03-07', durationMs: 30_000 }, { day: '2026-03-08', durationMs: 30_000 }]);
});

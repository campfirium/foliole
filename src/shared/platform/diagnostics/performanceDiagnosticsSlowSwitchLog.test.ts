import { beforeEach, describe, expect, it, vi } from 'vitest';

const logRuntimeEvent = vi.hoisted(() => vi.fn());
vi.mock('../runtimeLogging', () => ({ logRuntimeEvent }));

import { reportSlowNodeSwitch } from './performanceDiagnosticsSlowSwitchLog';
import { createNodeSelectionFlow } from '../performanceDiagnosticsState';

describe('slow note switch log', () => {
  beforeEach(() => logRuntimeEvent.mockClear());

  it('stays silent for a fast switch', () => {
    const flow = createNodeSelectionFlow({ nodeId: 'n', nodeTitle: 'Secret', requestedAt: 1000, selectedAt: 1000 });
    reportSlowNodeSwitch(flow, 'body', 1100);
    expect(logRuntimeEvent).not.toHaveBeenCalled();
  });

  it('logs phase durations once per stage and never the title or id', () => {
    const flow = createNodeSelectionFlow({ nodeId: 'note-id', nodeTitle: 'Secret title', requestedAt: 1000, selectedAt: 1000 });
    Object.assign(flow, { documentLoadStartedAt: 1010, documentLoadResolvedAt: 1400 });
    reportSlowNodeSwitch(flow, 'body', 1500);
    reportSlowNodeSwitch(flow, 'body', 1600);
    reportSlowNodeSwitch(flow, 'position', 1700);
    expect(logRuntimeEvent).toHaveBeenCalledTimes(2);
    const first = logRuntimeEvent.mock.calls[0]![0];
    expect(first.payload).toMatchObject({ stage: 'body', totalMs: 500, loadStartMs: 10, loadResolvedMs: 400 });
    expect(JSON.stringify(first)).not.toContain('Secret');
    expect(JSON.stringify(first)).not.toContain('note-id');
  });
});

import { describe, expect, it } from 'vitest';

import {
  finishCompanionManualSyncAction,
  markCompanionManualSyncActionRunning,
  startCompanionManualSyncAction
} from './companionManualSyncAction';

describe('manual sync action lifecycle', () => {
  it('keeps one action-local run identity from start through completion', () => {
    const starting = startCompanionManualSyncAction('manual-run');
    const running = markCompanionManualSyncActionRunning(starting);
    const terminal = finishCompanionManualSyncAction(running, 'completed');

    expect([starting.runId, running.runId, terminal.runId])
      .toEqual(['manual-run', 'manual-run', 'manual-run']);
    expect([starting.status, running.status, terminal.status])
      .toEqual(['starting', 'running', 'terminal']);
    expect([starting.started, running.started, terminal.started]).toEqual([true, true, true]);
    expect(terminal.terminalResult).toBe('completed');
  });

  it('keeps failure terminal on the clicked action identity', () => {
    const action = startCompanionManualSyncAction('clicked-run');
    const terminal = finishCompanionManualSyncAction(action, 'failed');

    expect(terminal).toEqual({
      runId: 'clicked-run', started: true, status: 'terminal', terminalResult: 'failed'
    });
  });
});

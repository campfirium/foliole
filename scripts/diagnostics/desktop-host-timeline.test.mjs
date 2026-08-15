// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  appendDesktopHostTimelineEvent,
  resolveDesktopHostTimelinePath
} from './desktop-host-timeline.mjs';

it('appends timestamped desktop host events to a daily local timeline', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-desktop-host-timeline-'));
  const now = new Date('2026-08-14T12:34:56.789Z');

  const result = appendDesktopHostTimelineEvent({
    event: 'started', operationId: 'operation-1', payload: { mode: 'hidden' }, pid: 42, source: 'hidden_native'
  }, { now, root });

  expect(result.logPath).toBe(path.join(root, '.tmp/diagnostics/desktop-host-2026-08-14.ndjson'));
  expect(JSON.parse(readFileSync(result.logPath, 'utf8'))).toEqual({
    event: 'started', occurredAt: now.toISOString(), operationId: 'operation-1',
    payload: { mode: 'hidden' }, pid: 42, source: 'hidden_native'
  });
  expect(resolveDesktopHostTimelinePath(now, root)).toBe(result.logPath);
});

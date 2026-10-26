import { afterEach, expect, it, vi } from 'vitest';

import { sqlRecording } from '../../../../lib/core/diagnostics/sqlRecording.js';

import { exposeCompanionSqlRecording } from './companionSqlRecording.js';

afterEach(() => {
  sqlRecording.stop();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, '__folioleSqlRecording');
});

it('exposes a stopped recorder only when development recording is explicitly enabled', () => {
  exposeCompanionSqlRecording();
  expect('__folioleSqlRecording' in globalThis).toBe(false);
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_FOLIOLE_SQL_RECORDING', '1');
  exposeCompanionSqlRecording();
  expect(Reflect.get(globalThis, '__folioleSqlRecording')).toBe(sqlRecording);
  expect(sqlRecording.snapshot()?.running ?? false).toBe(false);
  sqlRecording.start({ durationMs: 1000 });
  expect(sqlRecording.snapshot()?.running).toBe(true);
});

it('does not expose the development console recorder in production', () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_FOLIOLE_SQL_RECORDING', '1');
  exposeCompanionSqlRecording();
  expect('__folioleSqlRecording' in globalThis).toBe(false);
});

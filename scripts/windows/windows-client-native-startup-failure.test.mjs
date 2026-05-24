// @vitest-environment node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import {
  formatStartupFailureReason,
  formatStartupHealthFailure,
  readStartupFailureFromBootEvents
} from './windows-client-native-startup-failure.mjs';

it('reads the latest startup runtime failure for the requested native session', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-startup-failure-test-${Date.now()}`);
  const eventLogFile = path.join(tempDir, 'native-boot-events.ndjson');

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(eventLogFile, [
      JSON.stringify({ payload: { message: 'old failure', moduleLabel: 'Old' }, session: 'old', stage: 'startup_runtime_services_failed' }),
      JSON.stringify({ payload: { message: 'unable to open database file', moduleLabel: 'Startup services' }, session: 'current', stage: 'startup_runtime_services_failed' })
    ].join('\n'), 'utf8');

    const failure = readStartupFailureFromBootEvents(eventLogFile, { session: 'current' });

    expect(failure?.session).toBe('current');
    expect(formatStartupFailureReason(failure)).toBe(
      'startup runtime failed: Startup services: unable to open database file'
    );
    expect(readStartupFailureFromBootEvents(eventLogFile, { session: 'missing' })).toBeNull();
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

it('prefers the native runner stderr failure when startup exits before boot logging', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-runner-failure-test-${Date.now()}`);
  const stderrLog = path.join(tempDir, 'stderr.log');

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(stderrLog, "Error: native preview database is not writable: D:\\X\\U\\Foliole\\Data\\foliole.db\n", 'utf8');

    expect(formatStartupHealthFailure({ bootEvent: null, stderrLog })).toBe(
      'native preview database is not writable: D:\\X\\U\\Foliole\\Data\\foliole.db'
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

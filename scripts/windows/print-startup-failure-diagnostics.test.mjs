// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildStartupFailureDiagnostics } from './print-startup-failure-diagnostics.mjs';

describe('Windows startup failure diagnostics', () => {
  it('summarizes renderer errors from the latest boot session', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-startup-diagnostics-'));
    try {
      await mkdir(root, { recursive: true });
      await writeFile(
        path.join(root, 'native-boot-events.ndjson'),
        [
          JSON.stringify({ head: 'old', pid: 1, session: 'old', stage: 'app_ready' }),
          JSON.stringify({ head: 'new', pid: 2, session: 'current', stage: 'database_init_complete' }),
          JSON.stringify({ head: 'new', pid: 2, session: 'current', stage: 'bridge_ready' }),
          JSON.stringify({
            head: 'new',
            payload: {
              line: 62,
              message: 'Uncaught TypeError: args.backlinks.map is not a function',
              source: 'http://127.0.0.1:24600/src/app/components/documentPanelSectionSupport.tsx'
            },
            pid: 2,
            session: 'current',
            stage: 'window_error'
          }),
          JSON.stringify({ head: 'new', pid: 2, session: 'current', stage: 'app_ready_timeout' })
        ].join('\n'),
        'utf8'
      );

      const diagnostics = buildStartupFailureDiagnostics(root).join('\n');

      expect(diagnostics).toContain('session=current');
      expect(diagnostics).toContain('args.backlinks.map is not a function');
      expect(diagnostics).toContain('database_init_complete -> bridge_ready -> window_error -> app_ready_timeout');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

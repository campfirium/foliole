// @vitest-environment node

import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import { resolveWindowsDiagnosticLogDir } from './windowsDiagnosticPaths.js';

const originalWorkdir = process.env.FOLIOLE_WORKDIR;

afterEach(() => {
  process.env.FOLIOLE_WORKDIR = originalWorkdir;
  resolveAppPaths.mockReset();
});

it('uses the app log directory for Windows diagnostic logs by default', () => {
  delete process.env.FOLIOLE_WORKDIR;
  resolveAppPaths.mockReturnValue({ app_log_dir: '/app/logs' });

  expect(resolveWindowsDiagnosticLogDir()).toBe(path.join('/app/logs', 'windows'));
});

it('keeps explicit workdir diagnostics in the dev mirror tree', () => {
  process.env.FOLIOLE_WORKDIR = '/repo';

  expect(resolveWindowsDiagnosticLogDir()).toBe(path.join('/repo', 'logs', 'windows'));
  expect(resolveAppPaths).not.toHaveBeenCalled();
});

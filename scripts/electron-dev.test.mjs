// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('passes native GPU disable switches before the Electron app path', async () => {
  const runner = await readFile(path.resolve(process.cwd(), 'scripts/electron-dev.mjs'), 'utf8');
  const vitePort = await readFile(path.resolve(process.cwd(), 'scripts/electron-dev-vite-port.mjs'), 'utf8');

  expect(runner).toContain("args.push('--disable-gpu', '--disable-gpu-compositing', '--disable-gpu-sandbox');");
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG === '1'");
  expect(runner).toContain("args.push('--no-sandbox');");
  expect(runner).toContain("args.push(entryPath);");
  expect(runner).toContain("run(resolveElectronCommand(), createElectronArgs('electron-dist/electron/main.js')");
  expect(runner).toContain('consumeDevShellRestartRequest');
  expect(runner).toContain("process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE ??= DEV_SHELL_RESTART_REQUEST_FILE");
  expect(runner).toContain(".foliole-dev-shell-restart-request.json");
  expect(runner).toContain('foliole-dev-shell-restart');
  expect(runner).toContain('dev shell restart requested');
  expect(runner).toContain('parsed.runtimeHead');
  expect(runner).toContain('parsed.bootSession');
  expect(runner).toContain("request.shellAction === 'exit-shell'");
  expect(runner).toContain("path.join('node_modules', 'electron', 'dist', 'electron.exe')");
  expect(runner).toContain('shell: false');
  expect(runner).toContain('windowsHide: true');
  expect(runner).toContain('windowsHide: false');
  expect(runner).toContain('VITE_PREWARM_STARTUP_BUDGET_MS');
  expect(runner).toContain('const VITE_PREWARM_STARTUP_BUDGET_MS = 8000;');
  expect(runner).toContain('FOLIOLE_VITE_PREWARM_STARTUP_BUDGET_MS');
  expect(runner).toContain('strict Vite port already has a ready server');
  expect(runner).toContain('candidateVitePorts(preferredPort)');
  expect(vitePort).toContain('FOLIOLE_VITE_PORT_STRICT');
  expect(vitePort).toContain('return [preferredPort]');
  expect(runner).toContain('resolveVitePrewarmStartupBudgetMs()');
  expect(runner).toContain('FOLIOLE_ELECTRON_DEV_SKIP_COMPILE');
  expect(runner).toContain('FOLIOLE_ELECTRON_DEV_SKIP_APPEARANCE_GENERATION');
  expect(runner).toContain('FOLIOLE_ELECTRON_DEV_SKIP_VITE_PREWARM');
  expect(runner).toContain('const prewarmAbortController = new AbortController();');
  expect(runner).toContain('signal: prewarmAbortController.signal');
  expect(runner).toContain('abortController: prewarmAbortController');
  expect(runner).toContain('waitForPrewarmStartupBudget(');
  expect(runner).toContain('startup timing electron_launch');
  expect(runner).toContain('prewarmStatus=${prewarmStatus.status}');
});

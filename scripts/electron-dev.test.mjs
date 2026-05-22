// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('passes native GPU disable switches before the Electron app path', async () => {
  const runner = await readFile(path.resolve(process.cwd(), 'scripts/electron-dev.mjs'), 'utf8');

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
  expect(runner).toContain("path.join('node_modules', 'electron', 'dist', 'electron.exe')");
  expect(runner).toContain('shell: false');
  expect(runner).toContain('windowsHide: true');
  expect(runner).toContain('windowsHide: false');
  expect(runner).toContain('VITE_PREWARM_STARTUP_BUDGET_MS');
  expect(runner).toContain('waitForPrewarmStartupBudget(prewarmViteRendererEntries(viteState.viteUrl))');
  expect(runner).toContain('vite renderer prewarm complete');
  expect(runner).toContain('vite renderer prewarm still running; launching Electron');
});

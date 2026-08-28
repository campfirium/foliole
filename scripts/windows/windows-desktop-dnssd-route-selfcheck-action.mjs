import fs from 'node:fs';
import path from 'node:path';

import { resolveWindowsDesktopRouteElectronLauncher } from
  './windows-desktop-dnssd-route-action.mjs';
import { openWindowsSyncGroupSession } from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

const ACTION = 'desktop-dnssd-route-selfcheck';

async function runMissingRuntime(options) {
  const executable = path.join(options.paths.repoRoot, 'node_modules', 'electron',
    'dist', 'missing-electron.exe');
  try {
    await options.execute(executable, [], {
      cwd: options.paths.repoRoot, timeoutCode: 'desktop_dnssd_route_selfcheck_timeout',
      timeoutMs: 120_000, windowsHide: true
    });
  } catch (error) {
    fs.writeFileSync(path.join(options.evidenceRoot, 'selfcheck-negative-error.json'),
      `${JSON.stringify({ error: error.message, mode: options.selfcheckMode,
        output: error.output ?? null, resultStatus: 'expected-failure', schemaVersion: 1,
        stderr: error.stderr ?? null }, null, 2)}\n`, 'utf8');
    throw error;
  }
  throw new Error('desktop DNS-SD missing runtime selfcheck unexpectedly launched');
}

async function runProductLaunch(options, { closeSession, openSession, resolveLauncher }) {
  const launcher = resolveLauncher(options.paths.repoRoot);
  const session = await openSession(options.paths, options.evidenceRoot, launcher);
  try {
    const receipt = { completedAt: new Date().toISOString(), mode: options.selfcheckMode,
      processId: session.app.process().pid, resultStatus: 'success', schemaVersion: 1 };
    fs.writeFileSync(path.join(options.evidenceRoot, 'selfcheck-product-launch.json'),
      `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  } finally {
    await closeSession(session);
  }
}

export async function runWindowsDesktopDnsSdRouteSelfcheckAction(options, {
  closeSession = closeWindowsSyncGroupSession, openSession = openWindowsSyncGroupSession,
  resolveLauncher = resolveWindowsDesktopRouteElectronLauncher
} = {}) {
  if (options.selfcheckMode === 'missing-runtime') return runMissingRuntime(options);
  await runProductLaunch(options, { closeSession, openSession, resolveLauncher });
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), mode: options.selfcheckMode,
    resultStatus: 'success', runtimeRoot: options.paths.repoRoot, schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { desktopDnsSdRouteSelfcheck: { manifestPath }, output: '' };
}

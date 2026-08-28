import fs from 'node:fs';
import path from 'node:path';

const ACTION = 'desktop-dnssd-route-selfcheck';

function probePaths(paths, mode) {
  const executable = mode === 'missing-runtime' ? 'missing-electron.exe' : 'electron.exe';
  return {
    executable: path.join(paths.repoRoot, 'node_modules', 'electron', 'dist', executable),
    probe: path.join(paths.repoRoot, 'scripts', 'desktop', 'desktop-dnssd-native-probe.cjs')
  };
}

export async function runWindowsDesktopDnsSdRouteSelfcheckAction(options) {
  const { executable, probe } = probePaths(options.paths, options.selfcheckMode);
  let result;
  try {
    result = await options.execute(executable, [probe], {
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
  fs.writeFileSync(path.join(options.evidenceRoot, 'selfcheck-native-probe.log'),
    result.output ?? '', 'utf8');
  if (result.code !== 0) throw new Error(`desktop DNS-SD native probe exited ${result.code}`);
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), mode: options.selfcheckMode,
    resultStatus: 'success', runtimeRoot: options.paths.repoRoot, schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { desktopDnsSdRouteSelfcheck: { manifestPath }, output: result.output ?? '' };
}

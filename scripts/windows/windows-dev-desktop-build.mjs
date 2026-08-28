import path from 'node:path';

export async function runWindowsDevDesktopBuild(
  execute, paths, checked, { verifyDesktopDnsSd = false } = {}
) {
  let output = '';
  const scripts = ['build', 'electron:compile'];
  if (verifyDesktopDnsSd) scripts.push('electron:rebuild:native');
  for (const script of scripts) {
    const result = await checked(execute, paths.systemNode,
      [paths.systemNpmCli, 'run', script], {
        cwd: paths.repoRoot, timeoutCode: 'desktop_build_timeout', timeoutMs: 15 * 60_000,
        windowsHide: true
      }, 'desktop-build');
    output += result.output;
  }
  if (verifyDesktopDnsSd) {
    const result = await checked(execute,
      path.join(paths.repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
      [path.join(paths.repoRoot, 'scripts', 'desktop', 'desktop-dnssd-native-probe.cjs')], {
        cwd: paths.repoRoot, timeoutCode: 'desktop_dnssd_native_probe_timeout',
        timeoutMs: 120_000, windowsHide: true
      }, 'desktop-native-health');
    output += result.output;
  }
  return output;
}

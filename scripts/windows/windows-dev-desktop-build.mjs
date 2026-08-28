export async function runWindowsDevDesktopBuild(execute, paths, checked) {
  let output = '';
  const install = await checked(execute, paths.systemNode,
    [paths.systemNpmCli, 'ci', '--ignore-scripts'], {
      cwd: paths.repoRoot, timeoutCode: 'desktop_dependencies_timeout', timeoutMs: 15 * 60_000,
      windowsHide: true
    }, 'desktop-dependencies');
  output += install.output;
  for (const script of ['build', 'electron:compile']) {
    const result = await checked(execute, paths.systemNode,
      [paths.systemNpmCli, 'run', script], {
        cwd: paths.repoRoot, timeoutCode: 'desktop_build_timeout', timeoutMs: 15 * 60_000,
        windowsHide: true
      }, 'desktop-build');
    output += result.output;
  }
  return output;
}

import path from 'node:path';

export async function runWindowsDevDesktopBuild(execute, paths, checked,
  { materializeDependencies = false } = {}) {
  let output = '';
  const commands = materializeDependencies ? [
    { args: [paths.systemNpmCli, 'ci'], stage: 'desktop-dependencies', timeoutMs: 45 * 60_000 },
    { args: [path.win32.join(paths.repoRoot, 'node_modules', 'electron', 'install.js')],
      stage: 'desktop-electron-runtime' }
  ] : [];
  commands.push(...['build', 'electron:compile'].map((script) => ({
    args: [paths.systemNpmCli, 'run', script], stage: 'desktop-build'
  })));
  if (materializeDependencies) commands.push({
    args: [paths.systemNpmCli, 'run', 'electron:rebuild:native'], stage: 'desktop-native-rebuild'
  });
  for (const command of commands) {
    const result = await checked(execute, paths.systemNode, command.args, {
      cwd: paths.repoRoot, timeoutCode: `${command.stage}_timeout`,
      timeoutMs: command.timeoutMs ?? 20 * 60_000,
      windowsHide: true
    }, command.stage);
    output += result.output;
  }
  return output;
}

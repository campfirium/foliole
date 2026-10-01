import { copyFile, rename, chmod } from 'node:fs/promises';
import path from 'node:path';

export default async function installAppImageSandboxLauncher(context) {
  if (context.electronPlatformName !== 'linux') throw new Error('AppImage launcher requires Linux');
  const executable = context.packager.executableName;
  if (executable !== 'foliole') throw new Error(`Unexpected Linux executable: ${executable}`);
  const target = path.join(context.appOutDir, executable);
  await rename(target, path.join(context.appOutDir, 'foliole-runtime'));
  await copyFile('build/linux/appimage-launcher', target);
  await chmod(target, 0o755);
}

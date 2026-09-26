import { spawnSync } from 'node:child_process';
import { rename } from 'node:fs/promises';
import path from 'node:path';

function setPlistString(plist, key, value) {
  const result = spawnSync('plutil', ['-replace', key, '-string', value, plist], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Cannot set ${key} in ${plist}: ${result.stderr}`);
}

export default async function renameSourceHelpers(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const frameworks = path.join(context.appOutDir, 'Foliole.app/Contents/Frameworks');
  for (const suffix of ['', ' (GPU)', ' (Renderer)', ' (Plugin)']) {
    const oldName = `Foliole Helper${suffix}`;
    const newName = `Foliole Source Helper${suffix}`;
    const oldApp = path.join(frameworks, `${oldName}.app`);
    const oldBinary = path.join(oldApp, 'Contents/MacOS', oldName);
    await rename(oldBinary, path.join(oldApp, 'Contents/MacOS', newName));
    const plist = path.join(oldApp, 'Contents/Info.plist');
    setPlistString(plist, 'CFBundleExecutable', newName);
    setPlistString(plist, 'CFBundleName', newName);
    await rename(oldApp, path.join(frameworks, `${newName}.app`));
  }
}

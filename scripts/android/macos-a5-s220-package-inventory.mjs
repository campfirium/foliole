import fs from 'node:fs';
import path from 'node:path';

export const S220_APP_ID = 'com.foliole.android.s220acceptance';
const PROTECTED = ['com.foliole.android', 'com.foliole.android.acceptance'];

export async function inspectS220A5Packages({ assertFixed, execute, paths, serial }) {
  assertFixed();
  const policy = await execute(paths.adb,
    ['-s', serial, 'shell', 'dumpsys', 'window', 'policy'], { timeoutMs: 30_000 });
  if (policy.code !== 0) throw new Error('A5 lock-state inspection failed.');
  const lockMarkers = policy.stdout.split('\n').map((line) => line.trim())
    .filter((line) => /keyguard|lockscreen/iu.test(line)).slice(0, 24);
  const packages = {};
  for (const appId of [...PROTECTED, S220_APP_ID]) {
    const result = await execute(paths.adb,
      ['-s', serial, 'shell', 'pm', 'path', '--user', '0', appId], { timeoutMs: 30_000 });
    const output = result.stdout.trim();
    const absent = result.code === 1 && !output && !result.stderr.trim();
    if (!absent && (result.code !== 0
      || output && !output.split('\n').every((line) => line.startsWith('package:')))) {
      throw new Error(`Unexpected package inventory response for ${appId}: exit=${result.code} `
        + `stdout=${output.slice(0, 160)} stderr=${result.stderr.trim().slice(0, 160)}`);
    }
    packages[appId] = { installed: !absent && Boolean(output) };
  }
  const receipt = { checkedAt: new Date().toISOString(), lockMarkers, packages, serial,
    s220PackageAvailable: !packages[S220_APP_ID].installed };
  const filePath = path.join(paths.artifactsRoot, 'S220', 'a5-package-inventory.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { filePath, receipt };
}

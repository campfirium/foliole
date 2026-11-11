import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import type { ArticleTarget } from '../../lib/platform/articleTarget.js';

const run = promisify(execFile);
const applications = [
  { id: 'edge', name: 'Edge', mac: 'com.microsoft.edgemac', bundle: 'Microsoft Edge', windows: ['Microsoft', 'Edge', 'Application', 'msedge.exe'], linux: ['microsoft-edge', 'microsoft-edge-stable', 'com.microsoft.Edge'] },
  { id: 'chrome', name: 'Chrome', mac: 'com.google.Chrome', bundle: 'Google Chrome', windows: ['Google', 'Chrome', 'Application', 'chrome.exe'], linux: ['google-chrome', 'google-chrome-stable', 'com.google.Chrome'] },
  { id: 'firefox', name: 'Firefox', mac: 'org.mozilla.firefox', bundle: 'Firefox', windows: ['Mozilla Firefox', 'firefox.exe'], linux: ['firefox', 'org.mozilla.firefox'] },
  { id: 'safari', name: 'Safari', mac: 'com.apple.Safari', bundle: 'Safari', windows: [], linux: [] },
  { id: 'chromium', name: 'Chromium', mac: 'org.chromium.Chromium', bundle: 'Chromium', windows: [], linux: ['chromium', 'chromium-browser', 'org.chromium.Chromium'] },
  { id: 'vivaldi', name: 'Vivaldi', mac: 'com.vivaldi.Vivaldi', bundle: 'Vivaldi', windows: ['Vivaldi', 'Application', 'vivaldi.exe'], linux: ['vivaldi', 'vivaldi-stable', 'com.vivaldi.Vivaldi'] },
  { id: 'brave', name: 'Brave', mac: 'com.brave.Browser', bundle: 'Brave Browser', windows: ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'], linux: ['brave-browser', 'com.brave.Browser'] }
];

type KnownApplication = typeof applications[number];
export type LaunchTarget = ArticleTarget & { executable: string; args: string[] };

async function firstAvailable(paths: string[]) {
  for (const path of paths) {
    if (await access(path).then(() => true, () => false)) return path;
  }
  return null;
}

async function findMacApplication(target: KnownApplication, home: string) {
  const roots = ['/Applications', '/System/Applications', join(home, 'Applications')];
  const standard = await firstAvailable(roots.map((root) => join(root, target.bundle + '.app')));
  if (standard) return standard;
  const result = await run('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == '${target.mac}'`], { timeout: 2000 }).catch(() => null);
  return firstAvailable(result?.stdout.split('\n').filter((path) => path.endsWith('.app')) ?? []);
}

async function findWindowsApplication(target: KnownApplication) {
  const name = target.windows.at(-1);
  if (!name) return null;
  for (const hive of ['HKCU', 'HKLM']) {
    const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${name}`;
    const result = await run(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'), ['query', key, '/ve'], { timeout: 2000 }).catch(() => null);
    const path = result?.stdout.match(/REG_SZ\s+([^\r\n]+)/u)?.[1]?.trim().replace(/^"|"$/gu, '');
    if (path && await firstAvailable([path])) return path;
  }
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA];
  return firstAvailable(roots.flatMap((root) => root ? [join(root, ...target.windows)] : []));
}

async function findLinuxApplication(target: KnownApplication, home: string) {
  const roots = [
    process.env.XDG_DATA_HOME || join(home, '.local/share'),
    join(home, '.local/share/flatpak/exports/share'),
    ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':'),
    '/var/lib/flatpak/exports/share', '/var/lib/snapd/desktop'
  ];
  const desktopFile = await firstAvailable(target.linux.flatMap((name) => roots.filter(Boolean)
    .map((root) => join(root, 'applications', name + '.desktop'))));
  if (desktopFile && await firstAvailable(['/usr/bin/gio'])) return { executable: '/usr/bin/gio', args: ['launch', desktopFile] };
  const executable = await firstAvailable(target.linux.flatMap((name) => (process.env.PATH ?? '').split(delimiter)
    .filter((root) => root.startsWith('/')).map((root) => join(root, name))));
  return executable ? { executable, args: [] } : null;
}

async function resolveApplication(target: KnownApplication, home: string): Promise<LaunchTarget | null> {
  const identity = { id: target.id, name: target.name };
  if (process.platform === 'darwin') {
    const path = await findMacApplication(target, home);
    return path ? { ...identity, executable: '/usr/bin/open', args: ['-a', path] } : null;
  }
  if (process.platform === 'win32') {
    const executable = await findWindowsApplication(target);
    return executable ? { ...identity, executable, args: [] } : null;
  }
  if (process.platform !== 'linux') return null;
  const launch = await findLinuxApplication(target, home);
  return launch ? { ...identity, ...launch } : null;
}

export async function discoverArticleTargets(home: string) {
  const results = await Promise.all(applications.map((application) => resolveApplication(application, home)));
  return results.filter((target) => target !== null);
}

export async function resolveKnownArticleTarget(id: string, home: string) {
  const target = applications.find((application) => application.id === id);
  return target ? resolveApplication(target, home) : null;
}

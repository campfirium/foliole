#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LABEL = 'com.campfirium.foliole.scheduled-dev-push';
const MARKER = 'managed-by: foliole-scheduled-dev-push';
const DEFAULT_REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_SCRIPT = path.join(import.meta.dirname, 'scheduled-dev-push.mjs');
const SOURCE_HANDOFF = path.join(import.meta.dirname, 'scheduled-dev-push-handoff.mjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (options.allowStatus?.includes(result.status)) return result;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }
  return result;
}

export function launchAgentPaths(homeDirectory = os.homedir()) {
  const runtimeRoot = path.join(homeDirectory, '.codex/local-tools/foliole-safe-push');
  return {
    installedHandoff: path.join(runtimeRoot, 'scheduled-dev-push-handoff.mjs'),
    installedScript: path.join(runtimeRoot, 'scheduled-dev-push.mjs'),
    logsDirectory: path.join(runtimeRoot, 'logs'),
    plistPath: path.join(homeDirectory, `Library/LaunchAgents/${LABEL}.plist`),
    runtimeRoot
  };
}

export function preferredNodePath() {
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', process.execPath];
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) ?? process.execPath;
}

export function launchAgentXml(options) {
  const values = Object.fromEntries(Object.entries(options).map(([key, value]) => [key, xml(value)]));
  const executablePath = xml([
    path.dirname(options.nodePath), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'
  ].filter((entry, index, entries) => entries.indexOf(entry) === index).join(':'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${MARKER} -->
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${values.nodePath}</string><string>${values.installedScript}</string>
    <string>--repository</string><string>${values.repositoryRoot}</string>
  </array>
  <key>WorkingDirectory</key><string>${values.repositoryRoot}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${executablePath}</string>
  </dict>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>11</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>22</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>22</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${values.stdoutPath}</string>
  <key>StandardErrorPath</key><string>${values.stderrPath}</string>
</dict></plist>
`;
}

export function readManagedPlist(plistPath) {
  if (!fs.existsSync(plistPath)) return null;
  const content = fs.readFileSync(plistPath, 'utf8');
  if (!content.includes(MARKER) || !content.includes(`<string>${LABEL}</string>`)) {
    throw new Error(`Refusing unknown LaunchAgent: ${plistPath}`);
  }
  return content;
}

export function installLaunchAgent(options = {}, deps = defaultDeps()) {
  assertMac(options.platform);
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const paths = launchAgentPaths(options.homeDirectory);
  const previous = readManagedPlist(paths.plistPath);
  const wasLoaded = deps.serviceLoaded();
  if (wasLoaded && previous === null) throw new Error('Unknown service owns the LaunchAgent label');
  fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
  fs.mkdirSync(paths.logsDirectory, { recursive: true });
  const scriptTemp = `${paths.installedScript}.${process.pid}.tmp`;
  const handoffTemp = `${paths.installedHandoff}.${process.pid}.tmp`;
  const plistTemp = `${paths.plistPath}.${process.pid}.tmp`;
  fs.copyFileSync(options.sourceScript ?? SOURCE_SCRIPT, scriptTemp);
  fs.copyFileSync(options.sourceHandoff ?? SOURCE_HANDOFF, handoffTemp);
  fs.chmodSync(scriptTemp, 0o755);
  fs.chmodSync(handoffTemp, 0o755);
  fs.writeFileSync(plistTemp, launchAgentXml({
    installedScript: paths.installedScript,
    nodePath: options.nodePath ?? preferredNodePath(),
    repositoryRoot,
    stderrPath: path.join(paths.logsDirectory, 'stderr.log'),
    stdoutPath: path.join(paths.logsDirectory, 'stdout.log')
  }), 'utf8');
  deps.lint(plistTemp);
  if (wasLoaded) deps.bootout(paths.plistPath);
  fs.renameSync(handoffTemp, paths.installedHandoff);
  fs.renameSync(scriptTemp, paths.installedScript);
  fs.renameSync(plistTemp, paths.plistPath);
  deps.bootstrap(paths.plistPath);
  return { label: LABEL, loaded: true, paths };
}

export function uninstallLaunchAgent(options = {}, deps = defaultDeps()) {
  assertMac(options.platform);
  const paths = launchAgentPaths(options.homeDirectory);
  const managed = readManagedPlist(paths.plistPath);
  const loaded = deps.serviceLoaded();
  if (loaded && managed === null) throw new Error('Unknown service owns the LaunchAgent label');
  if (loaded) deps.bootout(paths.plistPath);
  if (managed !== null) fs.rmSync(paths.plistPath, { force: true });
  return { label: LABEL, loaded: false, removed: managed !== null };
}

export function launchAgentStatus(options = {}, deps = defaultDeps()) {
  const paths = launchAgentPaths(options.homeDirectory);
  return { label: LABEL, loaded: deps.serviceLoaded(), managed: readManagedPlist(paths.plistPath) !== null, paths };
}

function defaultDeps() {
  const domain = `gui/${process.getuid()}`;
  return {
    bootstrap: (plist) => run('/bin/launchctl', ['bootstrap', domain, plist]),
    bootout: (plist) => run('/bin/launchctl', ['bootout', domain, plist], { allowStatus: [0, 3, 113] }),
    lint: (plist) => run('/usr/bin/plutil', ['-lint', plist]),
    serviceLoaded: () => run('/bin/launchctl', ['print', `${domain}/${LABEL}`], { allowStatus: [0, 113] }).status === 0
  };
}

function assertMac(platform = process.platform) {
  if (platform !== 'darwin') throw new Error('Foliole scheduled push installation is macOS-only');
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function main() {
  const command = process.argv[2] ?? 'status';
  const handlers = { install: installLaunchAgent, status: launchAgentStatus, uninstall: uninstallLaunchAgent };
  if (!handlers[command]) throw new Error(`Unknown command: ${command}`);
  console.log(JSON.stringify(handlers[command](), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

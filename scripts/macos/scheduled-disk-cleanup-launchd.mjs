#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { preferredNodePath } from './scheduled-dev-push-launchd.mjs';

const LABEL = 'com.campfirium.foliole.scheduled-disk-cleanup';
const MARKER = 'managed-by: foliole-scheduled-disk-cleanup';
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

function run(command, args, allowStatus = [0]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (!allowStatus.includes(result.status)) {
    throw new Error(String(result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }
  return result;
}

export function cleanupAgentPaths(homeDirectory = os.homedir()) {
  const runtimeRoot = path.join(homeDirectory, '.codex/local-tools/foliole-disk-cleanup');
  return {
    logsDirectory: path.join(runtimeRoot, 'logs'),
    plistPath: path.join(homeDirectory, `Library/LaunchAgents/${LABEL}.plist`),
    runtimeRoot
  };
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Runs in place from the checkout: the round needs the repository's gate, lifecycle scripts and ledger.
export function cleanupAgentXml({ logsDirectory, nodePath, repositoryRoot }) {
  const searchPath = [path.dirname(nodePath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
    .filter((entry, index, entries) => entries.indexOf(entry) === index).join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${MARKER} -->
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(nodePath)}</string>
    <string>${xml(path.join(repositoryRoot, 'scripts/macos/scheduled-disk-cleanup-tick.mjs'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(repositoryRoot)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${xml(searchPath)}</string>
  </dict>
  <key>StartInterval</key><integer>3600</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logsDirectory, 'stdout.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logsDirectory, 'stderr.log'))}</string>
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

function defaultDeps() {
  const domain = `gui/${process.getuid()}`;
  return {
    bootout: (plist) => run('/bin/launchctl', ['bootout', domain, plist], [0, 3, 5, 113]),
    bootstrap: (plist) => run('/bin/launchctl', ['bootstrap', domain, plist]),
    lint: (plist) => run('/usr/bin/plutil', ['-lint', plist]),
    loaded: () => run('/bin/launchctl', ['print', `${domain}/${LABEL}`], [0, 113]).status === 0
  };
}

export function installCleanupAgent(options = {}, deps = defaultDeps()) {
  if ((options.platform ?? process.platform) !== 'darwin') throw new Error('Scheduled disk cleanup is macOS-only');
  const paths = cleanupAgentPaths(options.homeDirectory);
  const previous = readManagedPlist(paths.plistPath);
  const wasLoaded = deps.loaded();
  if (wasLoaded && previous === null) throw new Error('Unknown service owns the LaunchAgent label');
  fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
  fs.mkdirSync(paths.logsDirectory, { recursive: true });
  const temporary = `${paths.plistPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, cleanupAgentXml({
    logsDirectory: paths.logsDirectory,
    nodePath: options.nodePath ?? preferredNodePath(),
    repositoryRoot: options.repositoryRoot ?? REPOSITORY_ROOT
  }));
  deps.lint(temporary);
  if (wasLoaded) deps.bootout(paths.plistPath);
  fs.renameSync(temporary, paths.plistPath);
  deps.bootstrap(paths.plistPath);
  return { label: LABEL, loaded: true, paths };
}

export function uninstallCleanupAgent(options = {}, deps = defaultDeps()) {
  const paths = cleanupAgentPaths(options.homeDirectory);
  const managed = readManagedPlist(paths.plistPath);
  const loaded = deps.loaded();
  if (loaded && managed === null) throw new Error('Unknown service owns the LaunchAgent label');
  if (loaded) deps.bootout(paths.plistPath);
  if (managed !== null) fs.rmSync(paths.plistPath, { force: true });
  return { label: LABEL, loaded: false, removed: managed !== null };
}

export function cleanupAgentStatus(options = {}, deps = defaultDeps()) {
  const paths = cleanupAgentPaths(options.homeDirectory);
  let lastTick = null;
  try { lastTick = JSON.parse(fs.readFileSync(path.join(paths.runtimeRoot, 'state.json'), 'utf8')).lastTick; } catch { /* none yet */ }
  return { label: LABEL, lastTick, loaded: deps.loaded(), managed: readManagedPlist(paths.plistPath) !== null, paths };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const handlers = { install: installCleanupAgent, status: cleanupAgentStatus, uninstall: uninstallCleanupAgent };
  try {
    const handler = handlers[process.argv[2] ?? 'status'];
    if (!handler) throw new Error(`Unknown command: ${process.argv[2]}`);
    console.log(JSON.stringify(handler(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

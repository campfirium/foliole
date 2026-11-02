/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { runT234WebViewSession } from './macos-a5-t234-webview-session.mjs';

const APP = 'com.campfirium.foliole.android.acceptance';
const COMPONENT = `${APP}/com.foliole.android.MainActivity`;

export function createReviewVideoControls({ checked, captured, paths, serial, evidenceRoot,
  spawnProcess = spawn }) {
  let recording;
  let sequence = 0;
  const adb = args => ['-s', serial, ...args];
  const receipt = { appId: APP, serial, recordings: [], observations: [] };
  const save = () => fs.writeFileSync(path.join(evidenceRoot, 'recording.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  fs.mkdirSync(evidenceRoot, { recursive: true });

  async function stop() {
    if (!recording) return;
    const current = recording;
    if (!current.exited) {
      if (!current.pid) throw new Error('Recorder PID was not received; refusing an unowned stop.');
      checked(paths.adb, adb(['shell', 'kill', '-2', String(current.pid)]));
    }
    const code = await current.done;
    recording = undefined;
    current.entry.exitCode = code;
    if (code !== 0 && code !== 130) { save(); throw new Error(`Screen recorder failed: ${code}`); }
    checked(paths.adb, adb(['pull', current.remote, current.entry.path]));
    if (fs.statSync(current.entry.path).size === 0) throw new Error('Screen recorder produced an empty file.');
    checked(paths.adb, adb(['shell', 'rm', current.remote]));
    current.entry.endedAt = new Date().toISOString();
    save();
    console.log(`[a5-review-video] saved=${current.entry.path}`);
  }

  function start() {
    if (recording) throw new Error('A recording is already active.');
    const name = `take-${++sequence}`;
    const remote = `/data/local/tmp/foliole-review-${path.basename(evidenceRoot)}-${sequence}.mp4`;
    if (!/^[a-zA-Z0-9/._-]+$/u.test(remote)) throw new Error('Unsafe recording path.');
    const entry = { path: path.join(evidenceRoot, `${name}.mp4`), startedAt: new Date().toISOString() };
    const child = spawnProcess(paths.adb, adb(['shell',
      `screenrecord --time-limit 180 ${remote} & recorder=$!; echo RECORDER_PID:$recorder; wait $recorder`]),
    { stdio: ['ignore', 'pipe', 'pipe'] });
    const current = { child, entry, remote, pid: null, exited: false };
    current.done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => { current.exited = true; resolve(code); });
    });
    current.done.catch(() => {});
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/RECORDER_PID:(\d+)/u);
      if (match) current.pid = Number(match[1]);
    });
    child.stderr.on('data', chunk => fs.appendFileSync(path.join(evidenceRoot, `${name}.log`), chunk));
    recording = current;
    receipt.recordings.push(entry);
    save();
    console.log(`[a5-review-video] recording=${entry.path}`);
  }

  async function command(input) {
    if (input === 'record') return start();
    if (input === 'stop') return stop();
    const commands = {
      home: ['shell', 'input', 'keyevent', 'KEYCODE_HOME'],
      notifications: ['shell', 'cmd', 'statusbar', 'expand-notifications'],
      collapse: ['shell', 'cmd', 'statusbar', 'collapse'],
      'notification-settings': ['shell', 'am', 'start', '-W', '-a', 'android.settings.APP_NOTIFICATION_SETTINGS',
        '--es', 'android.provider.extra.APP_PACKAGE', APP],
      app: ['shell', 'am', 'start', '-W', '-n', COMPONENT]
    };
    if (commands[input]) return checked(paths.adb, adb(commands[input]));
    if (input === 'inspect') {
      const observation = { at: new Date().toISOString(),
        services: captured(paths.adb, adb(['shell', 'dumpsys', 'activity', 'services', APP])),
        package: captured(paths.adb, adb(['shell', 'dumpsys', 'package', APP])),
        android: captured(paths.adb, adb(['shell', 'getprop', 'ro.build.version.release'])) };
      receipt.observations.push(observation); save();
      console.log(`[a5-review-video] inspected=${path.join(evidenceRoot, 'recording.json')}`);
      return;
    }
    if (input === 'screenshot') {
      const name = `screen-${Date.now()}.png`;
      const file = path.join(evidenceRoot, name);
      const remote = `/data/local/tmp/foliole-review-${path.basename(evidenceRoot)}-${name}`;
      checked(paths.adb, adb(['shell', 'screencap', '-p', remote]));
      checked(paths.adb, adb(['pull', remote, file]));
      checked(paths.adb, adb(['shell', 'rm', remote]));
      console.log(`[a5-review-video] screenshot=${file}`); return;
    }
    throw new Error(`Unsupported review-video command: ${input}`);
  }
  return { command, stop };
}

async function interact(controls) {
  const lines = createInterface({ input: process.stdin, terminal: false });
  const finish = () => lines.close();
  process.on('SIGINT', finish); process.on('SIGTERM', finish);
  console.log('[a5-review-video] commands: record stop home notifications collapse notification-settings app inspect screenshot end');
  try {
    for await (const line of lines) {
      if (line.trim() === 'end') break;
      await controls.command(line.trim());
    }
  } finally {
    lines.close(); process.off('SIGINT', finish); process.off('SIGTERM', finish);
    await controls.stop();
  }
}

export async function runA5ReviewVideoSession(args) {
  const identity = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'T251-7', identity);
  const controls = createReviewVideoControls({ ...args, evidenceRoot });
  await runT234WebViewSession({ ...args, buildIdentity: () => identity,
    restoreAppId: APP, waitForEnd: () => interact(controls) });
}

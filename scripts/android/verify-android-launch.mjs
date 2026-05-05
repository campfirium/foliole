import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function extractTopActivity(dumpsysOutput) {
  const lines = dumpsysOutput.split(/\r?\n/);
  const patterns = [
    /topResumedActivity=.*? ([A-Za-z0-9._$]+\/[A-Za-z0-9._$]+)\b/,
    /ResumedActivity:.*? ([A-Za-z0-9._$]+\/[A-Za-z0-9._$]+)\b/,
    /mResumedActivity:.*? ([A-Za-z0-9._$]+\/[A-Za-z0-9._$]+)\b/
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

export function extractFocusedWindow(windowOutput) {
  const lines = windowOutput.split(/\r?\n/);
  const patterns = [
    /mCurrentFocus=.*? ([A-Za-z0-9._$]+\/[A-Za-z0-9._$]+)\}/,
    /mFocusedApp=.*? ([A-Za-z0-9._$]+\/[A-Za-z0-9._$]+)\b/
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

export function normalizeComponent(component) {
  const [pkg, activity = ''] = component.split('/');
  if (!pkg || !activity) {
    return component;
  }
  const normalizedActivity = activity.startsWith('.') ? `${pkg}${activity}` : activity;
  return `${pkg}/${normalizedActivity}`;
}

export function matchesLaunchComponent(actualComponent, expectedComponent, appId) {
  if (!actualComponent) {
    return false;
  }

  const normalizedActual = normalizeComponent(actualComponent);
  const normalizedExpected = normalizeComponent(expectedComponent);
  return normalizedActual === normalizedExpected || normalizedActual.startsWith(`${appId}/`);
}

function parseArgs(argv) {
  const options = {
    adb: 'adb',
    appId: '',
    component: '',
    serial: '',
    stabilitySeconds: 4,
    timeoutSeconds: 20
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--') || value == null) {
      continue;
    }
    switch (key) {
      case '--adb':
        options.adb = value;
        break;
      case '--app-id':
        options.appId = value;
        break;
      case '--component':
        options.component = value;
        break;
      case '--serial':
        options.serial = value;
        break;
      case '--timeout-seconds':
        options.timeoutSeconds = Number(value);
        break;
      case '--stability-seconds':
        options.stabilitySeconds = Number(value);
        break;
      default:
        break;
    }
    index += 1;
  }

  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runAdb(adbPath, serial, args) {
  const adbArgs = serial ? ['-s', serial, ...args] : args;
  const result = await execFileAsync(adbPath, adbArgs, { encoding: 'utf8' });
  return result.stdout ?? '';
}

async function collectLaunchState(adbPath, serial) {
  const [activityOutput, windowOutput] = await Promise.all([
    runAdb(adbPath, serial, ['shell', 'dumpsys', 'activity', 'activities']),
    runAdb(adbPath, serial, ['shell', 'dumpsys', 'window', 'windows'])
  ]);

  return {
    focusedWindow: extractFocusedWindow(windowOutput),
    topActivity: extractTopActivity(activityOutput)
  };
}

export async function verifyAndroidLaunch(options) {
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  let lastState = { focusedWindow: null, topActivity: null };

  while (Date.now() < deadline) {
    lastState = await collectLaunchState(options.adb, options.serial);
    const inForeground =
      matchesLaunchComponent(lastState.topActivity, options.component, options.appId) &&
      matchesLaunchComponent(lastState.focusedWindow, options.component, options.appId);

    if (!inForeground) {
      await sleep(1000);
      continue;
    }

    const stableDeadline = Date.now() + options.stabilitySeconds * 1000;
    let stable = true;
    while (Date.now() < stableDeadline) {
      await sleep(1000);
      lastState = await collectLaunchState(options.adb, options.serial);
      stable =
        matchesLaunchComponent(lastState.topActivity, options.component, options.appId) &&
        matchesLaunchComponent(lastState.focusedWindow, options.component, options.appId);
      if (!stable) {
        break;
      }
    }

    if (stable) {
      return { ok: true, state: lastState };
    }
  }

  return { ok: false, state: lastState };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.appId || !options.component) {
    console.error('[android-launch-check] missing required --app-id or --component');
    process.exit(1);
  }

  const result = await verifyAndroidLaunch(options);
  if (!result.ok) {
    console.error(`[android-launch-check] failed: topActivity=${result.state.topActivity ?? 'null'}`);
    console.error(`[android-launch-check] failed: focusedWindow=${result.state.focusedWindow ?? 'null'}`);
    process.exit(1);
  }

  console.log(`[android-launch-check] topActivity=${result.state.topActivity}`);
  console.log(`[android-launch-check] focusedWindow=${result.state.focusedWindow}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function redactArg(args, index) {
  return args[index - 1] === '--value' || (args[index - 2] === '-e' && args[index - 1] === 'valueBase64')
    ? '<redacted>'
    : args[index];
}

export function redactedUiProgressArgs(args) {
  return args.map((_, index) => redactArg(args, index));
}

export function createUiAutomationProgress({ evidenceRoot, stdout = process.stdout }) {
  const progressPath = path.join(evidenceRoot, 'ui-progress.json');
  const events = [];
  const write = (event) => {
    const entry = { ...event, at: new Date().toISOString(), sequence: events.length + 1 };
    events.push(entry);
    fs.writeFileSync(progressPath, `${JSON.stringify({ events, schemaVersion: 1 }, null, 2)}\n`);
    stdout.write(`[windows-android-lab-ui] ${entry.state}: ${entry.label}\n`);
  };
  return {
    begin(command, args) {
      write({ args: redactedUiProgressArgs(args), command: path.basename(command), label: stageLabel(args), state: 'begin' });
    },
    done(command, args) {
      write({ args: redactedUiProgressArgs(args), command: path.basename(command), label: stageLabel(args), state: 'done' });
    },
    fail(command, args, error) {
      write({
        args: redactedUiProgressArgs(args), command: path.basename(command),
        errorCode: error.code || 'failed', label: stageLabel(args), state: 'fail'
      });
    }
  };
}

function stageLabel(args) {
  const text = args.join(' ');
  if (text.includes('assembleDebugAndroidTest')) return 'gradle assembleDebugAndroidTest';
  if (text.includes('install -r -t')) return 'install test APK';
  if (text.includes('install -r')) return 'install app APK';
  if (text.includes('KEYCODE_WAKEUP')) return 'wake device';
  if (text.includes('dismiss-keyguard')) return 'dismiss keyguard';
  if (text.includes('dumpsys window policy')) return 'read lockscreen policy';
  if (text.includes('dumpsys power')) return 'read power state';
  if (text.includes('am start')) return 'launch Foliole';
  if (text.includes('dumpsys window windows')) return 'verify foreground window';
  if (text.includes('am instrument')) return 'run WebView instrumentation';
  return args.slice(0, 4).join(' ');
}

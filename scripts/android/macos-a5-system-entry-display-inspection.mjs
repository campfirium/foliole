import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';

const APP_ID = 'com.foliole.android';
const RUNNER = `${APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionSystemEntryDisplayNameTest#displaysHydratedInboxNameAfterRestart`;

function receipt(output) {
  const prefix = 'INSTRUMENTATION_STATUS: folioleActionReceipt=';
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) {
    const diagnostic = String(output).split(/\r?\n/u).filter((entry) =>
      /INSTRUMENTATION_(?:RESULT: shortMsg|STATUS: stack|STATUS_CODE: -2)|FAILURES!!!|Tests run:/u
        .test(entry)).slice(-6).join(' | ').slice(0, 1_200);
    throw new Error(`System entry display instrumentation did not emit a receipt: ${
      diagnostic || 'no bounded test diagnostic'}`);
  }
  return JSON.parse(line.slice(prefix.length));
}

async function checked(execute, command, args, options, label) {
  const result = await execute(command, args, options);
  if (result.code !== 0) throw Object.assign(new Error(`${label} failed.`), { result });
  return result;
}

export async function inspectA5SystemEntryDisplayName({
  buildIdentity, env, evidenceRoot, execute, expectedText = '', forbiddenText = '', paths, serial
}) {
  const testApk = path.join(
    paths.buildRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
  );
  const options = { env, timeoutCode: 'system_entry_display_timeout', timeoutMs: 3 * 60_000 };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  let installed = false;
  try {
    await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options,
      'System entry test install');
    installed = true;
    const textExtras = [];
    if (expectedText) textExtras.push(
      '-e', 'expectedTextBase64', Buffer.from(expectedText, 'utf8').toString('base64')
    );
    if (forbiddenText) textExtras.push(
      '-e', 'forbiddenTextBase64', Buffer.from(forbiddenText, 'utf8').toString('base64')
    );
    const result = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', TEST_CLASS,
      ...textExtras,
      RUNNER
    ], options, 'System entry display instrumentation');
    if (!/^INSTRUMENTATION_CODE: -1$/mu.test(result.stdout)) {
      throw Object.assign(new Error('System entry display instrumentation did not finish.'), { result });
    }
    const actionReceipt = receipt(result.stdout);
    const manifestPath = path.join(evidenceRoot, 'system-entry-display-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ actionReceipt, buildIdentity,
      completedAt: new Date().toISOString(), resultStatus: 'success', serial, testClass: TEST_CLASS
    }, null, 2)}\n`, 'utf8');
    return { actionReceipt, manifestPath };
  } finally {
    if (installed) await checked(execute, paths.adb, [
      '-s', serial, 'uninstall', `${APP_ID}.test`
    ], options, 'System entry test cleanup');
  }
}

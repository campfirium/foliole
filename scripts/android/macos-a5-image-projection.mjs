import fs from 'node:fs';
import path from 'node:path';

export function imageProjectionMode(env) {
  const mode = env.FOLIOLE_S203_IMAGE_PROJECTION ?? '';
  if (!['', 'inspect', 'remove', 'cases-inspect', 'cases-remove-changed', 'cases-offline', 'cases-online'].includes(mode)) {
    throw new Error('Unknown S203 image projection mode.');
  }
  if (['remove', 'cases-remove-changed', 'cases-offline', 'cases-online'].includes(mode) && env.FOLIOLE_A5_TEST_DATA_DISPOSABLE !== '1') {
    throw new Error('Removing the public image fixture requires disposable test data authorization.');
  }
  return mode;
}

export async function runImageProjection(args, root, mode) {
  if (!mode) return;
  const cases = mode.startsWith('cases-');
  const pid = args.env.FOLIOLE_S203_IMAGE_PID ?? '';
  if (pid && !/^[0-9]{1,8}$/u.test(pid)) throw new Error('Invalid observed image process.');
  const result = await args.execute(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'instrument', '-w', '-r',
    '-e', 'class', `com.foliole.android.FolioleArticleImage${cases ? 'Cases' : ''}ProjectionTest`,
    '-e', 'caseMode', cases ? mode.slice('cases-'.length) : 'inspect', ...(pid ? ['-e', 'observedPid', pid] : []),
    '-e', 'removePublicImage', String(mode === 'remove'),
    '-e', 'disposableTestData', String(args.env.FOLIOLE_A5_TEST_DATA_DISPOSABLE === '1'),
    'com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner'],
  { env: args.env, timeoutCode: 'image_projection_timeout', timeoutMs: 60_000 });
  fs.writeFileSync(path.join(root, 'article-projection.log'), result.output ?? '');
  if (result.code !== 0 || !/OK \(1 test\)/u.test(result.output)
    || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(result.output)) {
    throw new Error('S203 article image projection failed.');
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { PERFORMANCE_APP_ID } from './a5-database-performance-build.mjs';

export async function measureAttachmentQueues({ execute, paths, serial, options, evidenceRoot }) {
  const run = async args => {
    const result = await execute(paths.adb, ['-s', serial, ...args], options);
    if (result.code !== 0) throw new Error(`Attachment queue measurement command failed: ${result.code}`);
    return result.output;
  };
  const output = await run(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
    'com.foliole.android.FolioleAttachmentQueueMeasurementTest',
    `${PERFORMANCE_APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`]);
  fs.writeFileSync(path.join(evidenceRoot, 'attachment-queue-instrumentation.log'), output);
  if (!/OK \(1 test\)/u.test(output) || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output)) {
    throw new Error('Attachment queue instrumentation failed.');
  }
  const raw = await run(['exec-out', 'run-as', PERFORMANCE_APP_ID, 'cat', 'files/attachment-queue-result.json']);
  const result = JSON.parse(raw);
  if (result.appId !== PERFORMANCE_APP_ID || result.scenario !== 'attachment-queue'
    || result.status !== 'passed' || result.cleanup !== true || result.runs?.length !== 5) {
    throw new Error('Attachment queue measurement evidence is invalid.');
  }
  for (const sample of result.runs) {
    for (const name of ['baselineImage', 'baselineSql', 'maintenance', 'imageDuring', 'sqlDuring']) {
      for (const field of ['queueMs', 'executionMs', 'totalMs']) {
        if (!Number.isFinite(sample[name]?.[field]) || sample[name][field] < 0) {
          throw new Error('Attachment queue measurement timing is invalid.');
        }
      }
    }
  }
  const evidencePath = path.join(evidenceRoot, 'attachment-queue-result.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
  return { evidencePath, output };
}

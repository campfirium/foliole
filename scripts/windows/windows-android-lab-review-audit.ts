#!/usr/bin/env node
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AuditPhase, ReviewAuditSession } from '../android/android-review-audit-types.ts';

register('../android/ts-js-extension-loader.mjs', import.meta.url);

const { auditAndroidReviewDatabase } = await import('../android/android-review-audit.ts');

interface LegacyAcceptanceSession extends ReviewAuditSession {
  commitSha: string;
  deploymentRunId: string;
  deviceIdentity: string;
}

function parseCli(argv: string[]) {
  const values = Object.fromEntries(argv.reduce<Array<[string, string]>>((entries, key, index) => {
    if (key.startsWith('--') && argv[index + 1]) entries.push([key.slice(2), argv[index + 1]]);
    return entries;
  }, []));
  const checkpoint = values.checkpoint as AuditPhase;
  if (!['prepare', 'capture', 'restart'].includes(checkpoint)) throw new Error('invalid review checkpoint');
  for (const key of ['commit', 'database', 'deployment-run', 'device', 'output', 'run']) {
    if (!values[key]) throw new Error(`missing --${key}`);
  }
  return { checkpoint, values };
}

function main() {
  const { checkpoint, values } = parseCli(process.argv.slice(2));
  const session = values.session
    ? JSON.parse(fs.readFileSync(values.session, 'utf8')) as LegacyAcceptanceSession
    : undefined;
  const core = auditAndroidReviewDatabase({
    checkpoint,
    databasePath: values.database,
    session
  });
  const audit = {
    checkpoint,
    commitSha: values.commit,
    deploymentRunId: values['deployment-run'],
    deviceIdentity: values.device,
    runId: values.run,
    ...core
  };
  const temporary = `${values.output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(audit, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, values.output);
  if (audit.resultStatus === 'failure') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) {
    console.error(`[windows-android-lab-review-audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

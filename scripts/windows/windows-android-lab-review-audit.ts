#!/usr/bin/env node
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openReadonlySqliteDatabaseSync } from '../android/sqlite-readonly.mjs';

register('../android/ts-js-extension-loader.mjs', import.meta.url);

const { readScheduler, readReviewAuditState, section } =
  await import('./windows-android-lab-review-audit-state.ts');
const { selectReviewAcceptanceObjects } =
  await import('./windows-android-lab-review-selection.ts');
const { validateCaptureTransition, validateRestartPersistence } =
  await import('./windows-android-lab-review-transition.ts');
import type {
  AcceptanceSession, AuditContext, AuditPhase, Section
} from './windows-android-lab-review-audit-types.ts';

type SqliteRow = Record<string, unknown> | undefined;
type SqliteStatement = {
  get: (...args: unknown[]) => SqliteRow;
};
type Sqlite = {
  close: () => void;
  prepare: (sql: string) => SqliteStatement;
};

function credentialSafeEndpoint(value: string) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of url.searchParams.keys()) {
      if (/token|secret|password|credential|key/iu.test(key)) url.searchParams.set(key, '[credential-omitted]');
    }
    return url.toString().replace(/\/$/u, '');
  } catch { return value; }
}

function readPairing(db: Sqlite) {
  const row = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'workspace_sync_endpoint_url' LIMIT 1"
  ).get() as { value: string } | undefined;
  const endpointUrl = row?.value ? credentialSafeEndpoint(row.value) : null;
  const target = !endpointUrl ? 'unpaired'
    : /^https?:\/\/(?:127\.0\.0\.1|localhost):38641(?:\/|$)/u.test(endpointUrl) ? 'windows_executor' : 'remote_peer';
  return { endpointUrl, target };
}

function readSync(db: Sqlite) {
  const cursorRow = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'sync_review_log_push_cursor' LIMIT 1"
  ).get() as { value: string } | undefined;
  const eventsRow = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'workspace_sync_events' LIMIT 1"
  ).get() as { value: string } | undefined;
  const events = eventsRow?.value ? JSON.parse(eventsRow.value) as Array<Record<string, unknown>> : [];
  return {
    recentEvents: events.slice(0, 12).map((event) => ({
      endpointUrl: typeof event.endpoint_url === 'string' ? credentialSafeEndpoint(event.endpoint_url) : null,
      kind: event.kind ?? null, message: event.message ?? null, occurredAt: event.occurred_at ?? null,
      result: event.result ?? null, status: event.status ?? null
    })),
    reviewLogPushCursor: cursorRow?.value ?? null
  };
}

function selectedFromSession(session: AcceptanceSession) {
  return {
    fsrsNodeId: session.fsrsNodeId,
    readingNodeIds: session.readingNodeIds,
    source: 'review_session'
  };
}

function transitionIssues(args: {
  checkpoint: AuditPhase;
  current: ReturnType<typeof readReviewAuditState>;
  session?: AcceptanceSession;
  settings: Parameters<typeof validateCaptureTransition>[2];
}) {
  if (args.checkpoint === 'prepare') return [];
  if (!args.session) return [{
    code: 'review_session_missing', error: 'review prepare must complete before this phase', name: 'transition'
  }];
  return args.checkpoint === 'capture'
    ? validateCaptureTransition(args.session, args.current, args.settings)
    : validateRestartPersistence(args.session, args.current);
}

export function auditAndroidReviewDatabase(args: {
  context: AuditContext;
  databasePath: string;
  now?: string;
  session?: AcceptanceSession;
}) {
  const db = openReadonlySqliteDatabaseSync(args.databasePath) as Sqlite;
  try {
    const scheduler = readScheduler(db);
    const pairing = section(() => readPairing(db));
    const sync = section(() => readSync(db));
    const acceptance = args.session
      ? { status: 'available' as const, value: selectedFromSession(args.session) }
      : scheduler.value?.settings
        ? selectReviewAcceptanceObjects(db, scheduler.value.settings, args.now ?? new Date().toISOString())
        : { error: 'review scheduler settings are unavailable', status: 'invalid' as const };
    const selected = acceptance.status === 'available' && acceptance.value.fsrsNodeId
      ? { fsrsNodeId: acceptance.value.fsrsNodeId, readingNodeIds: acceptance.value.readingNodeIds }
      : null;
    const current = selected && scheduler.value?.schedulerVersion
      ? section(() => readReviewAuditState(
          db, selected, scheduler.value!.schedulerVersion, sync.value?.reviewLogPushCursor ?? null
        ))
      : { status: 'missing' as const };
    const transitions = current.value && scheduler.value?.settings
      ? transitionIssues({
          checkpoint: args.context.checkpoint,
          current: current.value,
          session: args.session,
          settings: scheduler.value.settings
        })
      : [];
    const sections: Array<{ name: string; section: Section<unknown> }> = [
      { name: 'scheduler', section: scheduler }, { name: 'pairing', section: pairing },
      { name: 'sync', section: sync }, { name: 'acceptance', section: acceptance },
      { name: 'state', section: current }
    ];
    const issues = [
      ...sections.filter(({ section: entry }) => entry.status !== 'available')
        .map(({ name, section: entry }) => ({ error: entry.error ?? null, name, status: entry.status })),
      ...transitions.map((issue) => ({ ...issue, status: 'invalid' as const }))
    ];
    const errorCode = scheduler.status === 'missing' ? 'review_scheduler_settings_missing'
      : scheduler.status === 'invalid' ? 'review_scheduler_settings_invalid'
        : acceptance.status !== 'available' ? 'review_acceptance_data_insufficient'
          : transitions[0]?.code ?? (issues.length ? 'review_audit_data_invalid' : null);
    return {
      ...args.context, acceptance, capturedAt: new Date().toISOString(), current: current.value ?? null,
      errorCode, issues, pairing, resultStatus: issues.length ? 'failure' : 'success', scheduler,
      schemaVersion: 3, selected, sync, transitions
    };
  } finally { db.close(); }
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
    ? JSON.parse(fs.readFileSync(values.session, 'utf8')) as AcceptanceSession
    : undefined;
  const audit = auditAndroidReviewDatabase({
    context: {
      checkpoint, commitSha: values.commit, deploymentRunId: values['deployment-run'],
      deviceIdentity: values.device, runId: values.run
    },
    databasePath: values.database,
    session
  });
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

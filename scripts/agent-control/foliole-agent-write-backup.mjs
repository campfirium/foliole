/* global process */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BACKUP_DIR = path.join('.tmp', 'agent-control', 'backups');

export async function writeAgentBackup(args) {
  const backupDir = args.flags.backup_dir ?? args.options.env?.FOLIOLE_AGENT_BACKUP_DIR ?? process.env.FOLIOLE_AGENT_BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  const runId = args.options.randomId?.() ?? randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(backupDir, `agent-${args.kind}-${args.command.replace('/', '-')}-${args.targetId}-${timestamp}-${runId}.json`);
  const payload = {
    command: args.command,
    created_at: new Date().toISOString(),
    request_patch: args.patch,
    run_id: runId,
    target_id: args.targetId,
    [`${args.kind}_id`]: args.targetId,
    [`previous_${args.kind}`]: args.previous
  };
  try {
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { ok: true, path: backupPath };
  } catch {
    return { error: 'backup_write_failed', ok: false };
  }
}

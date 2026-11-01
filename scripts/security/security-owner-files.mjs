import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeOwnerRecord(directory, record, { beforeRename = () => {} } = {}) {
  mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${record.id}.json`);
  const contents = `${JSON.stringify(record, null, 2)}\n`;
  if (existsSync(destination)) {
    if (readFileSync(destination, 'utf8') !== contents) throw new Error('Conflicting immutable owner record');
    return { duplicate: true, file: destination };
  }
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600, flush: true });
    beforeRename();
    renameSync(temporary, destination);
  } finally { rmSync(temporary, { force: true }); }
  return { duplicate: false, file: destination };
}

export function readOwnerRecords(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)).map(name => {
    const record = JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
    if (record.schemaVersion !== 1 || record.id !== name.slice(0, -5)) throw new Error('Corrupted owner record');
    return record;
  });
}

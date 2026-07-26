import { execFile } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseProcessLine(line) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s+(.+)$/);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    startTime: new Date(match[4]).toISOString(),
    command: match[5]
  };
}

export function parseMacProcessTable(stdout) {
  return stdout.split('\n').map(parseProcessLine).filter(Boolean);
}

export async function readMacProcessTable() {
  if (process.platform !== 'darwin') return [];
  const { stdout } = await execFileAsync('/bin/ps', [
    '-axo', 'pid=,ppid=,pgid=,lstart=,command='
  ], { maxBuffer: 8 * 1024 * 1024 });
  return parseMacProcessTable(stdout);
}

export function isOwnedMainProcess(processInfo, record) {
  if (!processInfo || processInfo.pid !== record.mainPid || processInfo.pgid !== record.mainPgid) return false;
  if (processInfo.startTime !== record.mainStartTime) return false;
  const executable = path.resolve(record.executable);
  return processInfo.command === record.mainCommand &&
    processInfo.command.startsWith(executable) &&
    processInfo.command.includes(record.mainEntry) &&
    processInfo.command.includes(record.launchId) &&
    processInfo.command.includes(record.stateRoot);
}

export function findOwnedLaunchProcesses(processTable, record) {
  const main = processTable.find((entry) => entry.pid === record.mainPid);
  if (!isOwnedMainProcess(main, record)) return { accepted: [], reason: 'main-identity-mismatch' };
  const accepted = processTable.filter((entry) => {
    if (entry.pgid === record.mainPgid) return true;
    return entry.startTime >= record.mainStartTime &&
      entry.command.includes(record.launchId) &&
      entry.command.includes(record.stateRoot);
  });
  return { accepted, reason: null };
}

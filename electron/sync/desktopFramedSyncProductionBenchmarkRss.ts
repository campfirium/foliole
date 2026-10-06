import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function startRssSampling(processIds: () => readonly number[]) {
  let active = true;
  let peakRssBytes = 0;
  const sampledProcessIds = new Set<number>();
  const sample = async () => {
    const pids = processIds();
    for (const pid of pids) sampledProcessIds.add(pid);
    peakRssBytes = Math.max(peakRssBytes, await sampleRssBytes(pids));
  };
  const polling = (async () => {
    while (active) {
      await sample();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await sample();
  })();
  return { async stop() {
    active = false;
    await polling;
    return { peakRssBytes, sampledProcessIds: [...sampledProcessIds] };
  } };
}

async function sampleRssBytes(pids: readonly number[]) {
  if (pids.length === 0) throw new Error('rss_process_ids_missing');
  const readings = await Promise.all(pids.map(async (pid) => {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]));
    } catch (error) {
      if (isProcessGone(error)) return 0;
      throw error;
    }
    const kibibytes = Number(stdout.trim());
    if (!Number.isSafeInteger(kibibytes) || kibibytes < 0) throw new Error('rss_sample_invalid');
    return kibibytes * 1024;
  }));
  return readings.reduce((total, bytes) => total + bytes, 0);
}

function isProcessGone(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 1;
}

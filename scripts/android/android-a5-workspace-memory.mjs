import { setTimeout as delay } from 'node:timers/promises';

const SAMPLE_INTERVAL_MS = 100;

export function parseAndroidPackageMemory(output, elapsedMs) {
  const totals = String(output).match(/TOTAL PSS:\s*([\d,]+).*?TOTAL RSS:\s*([\d,]+)/su);
  if (!totals) return null;
  const pid = String(output).match(/\*\* MEMINFO in pid\s+(\d+)/u)?.[1];
  return {
    elapsedMs, pid: pid ? Number(pid) : null,
    pssKb: Number(totals[1].replaceAll(',', '')),
    rssKb: Number(totals[2].replaceAll(',', ''))
  };
}

export async function measureAndroidWorkspaceMemory({ adb, appId, env, execute, serial }, operation) {
  const startedAt = Date.now();
  const samples = [];
  let active = true;
  let sampleErrors = 0;
  const sampler = (async () => {
    while (active) {
      try {
        const result = await execute(adb, ['-s', serial, 'shell', 'dumpsys', 'meminfo', appId], {
          env, timeoutCode: 'workspace_memory_sample_timeout', timeoutMs: 15_000
        });
        const sample = result.code === 0
          ? parseAndroidPackageMemory(result.output, Date.now() - startedAt) : null;
        if (sample) samples.push(sample);
        else sampleErrors += 1;
      } catch {
        sampleErrors += 1;
      }
      if (active) await delay(SAMPLE_INTERVAL_MS);
    }
  })();
  let value;
  let operationError;
  try {
    value = await operation();
  } catch (error) {
    operationError = error;
  } finally {
    active = false;
    await sampler;
  }
  if (operationError) throw operationError;
  if (samples.length === 0) throw new Error(`No target App memory sample was captured for ${appId}.`);
  const peakPss = samples.reduce((peak, sample) => sample.pssKb > peak.pssKb ? sample : peak);
  const peakRss = samples.reduce((peak, sample) => sample.rssKb > peak.rssKb ? sample : peak);
  return { value, memory: {
    command: `dumpsys meminfo ${appId}`,
    definition: 'Observed target App process PSS/RSS during the supplied measurement window.',
    limitation: 'Includes instrumentation overhead and WebView memory charged to the target App process; Android isolated WebView renderer processes are not reliably attributable and are excluded.',
    peakPssKb: peakPss.pssKb, peakPssAtMs: peakPss.elapsedMs,
    peakRssKb: peakRss.rssKb, peakRssAtMs: peakRss.elapsedMs,
    sampleCount: samples.length, sampleErrors, sampleIntervalMs: SAMPLE_INTERVAL_MS, samples
  } };
}

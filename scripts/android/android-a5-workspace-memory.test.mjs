import { expect, it } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';

import {
  measureAndroidWorkspaceMemory, parseAndroidPackageMemory
} from './android-a5-workspace-memory.mjs';

it('parses target App PSS and RSS without treating other output as a sample', () => {
  expect(parseAndroidPackageMemory(
    '** MEMINFO in pid 321 [com.foliole.android.acceptance] **\nTOTAL PSS: 155,956 TOTAL RSS: 285,640',
    1200
  )).toEqual({ elapsedMs: 1200, pid: 321, pssKb: 155956, rssKb: 285640 });
  expect(parseAndroidPackageMemory('No process found for: com.foliole.android.acceptance', 0)).toBeNull();
});

it('records target App peaks while the registered workspace operation runs', async () => {
  const outputs = [
    '** MEMINFO in pid 321 [app] **\nTOTAL PSS: 100 TOTAL RSS: 200',
    '** MEMINFO in pid 321 [app] **\nTOTAL PSS: 180 TOTAL RSS: 260'
  ];
  let release;
  const operation = new Promise(resolve => { release = resolve; });
  const measurement = measureAndroidWorkspaceMemory({
    adb: '/adb', appId: 'com.foliole.android.acceptance', env: {}, serial: 'fixed-a5',
    execute: async () => ({ code: 0, output: outputs.shift() ?? outputs.at(-1) })
  }, () => operation);
  await delay(130);
  release({ output: 'OK (1 test)' });
  const result = await measurement;
  expect(result.value).toEqual({ output: 'OK (1 test)' });
  expect(result.memory).toMatchObject({ peakPssKb: 180, peakRssKb: 260, sampleCount: 2,
    sampleErrors: 0, sampleIntervalMs: 100 });
  expect(result.memory.limitation).toContain('isolated WebView renderer processes');
});

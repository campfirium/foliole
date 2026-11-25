// @vitest-environment node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateReadinessCase, type ReadinessCase, type ReadinessResult } from './reviewReadiness.property.testSupport';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPPORT = path.join(HERE, 'reviewReadiness.property.testSupport.ts');
const JITI = path.resolve(HERE, '../../node_modules/jiti/lib/jiti-cli.mjs');
const cases = Array.from({ length: 800 }, (_, index) => generateReadinessCase(index + 1));
const sameDevice = (testCase: ReadinessCase) => testCase.creatorZone === testCase.graderZone
  && testCase.creatorHour === testCase.graderHour;

function childEnv(zone: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, TZ: zone, REVIEW_READINESS_CHILD: '1' };
  for (const key of Object.keys(env)) if (key.startsWith('VITEST') || key === 'NODE_OPTIONS') delete env[key];
  return env;
}

/** Worker threads ignore `process.env.TZ` changes, so each grading zone runs in its own process. */
function evaluateInZone(zone: string, selected: ReadinessCase[]) {
  return new Promise<ReadinessResult[]>((resolve, reject) => {
    const child = spawn(process.execPath, [JITI, SUPPORT], { env: childEnv(zone), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${zone}: ${stderr || `exit ${code}`}`));
      const output = JSON.parse(stdout.trim().split('\n').at(-1)!) as { zone: string; results: ReadinessResult[] };
      return output.zone === zone ? resolve(output.results) : reject(new Error(`${zone}: answered for ${output.zone}`));
    });
    child.stdin.end(JSON.stringify(selected));
  });
}

async function failures(selected: ReadinessCase[]) {
  const zones = [...new Set(selected.map(testCase => testCase.graderZone))];
  const results = (await Promise.all(zones.map(zone =>
    evaluateInZone(zone, selected.filter(testCase => testCase.graderZone === zone))))).flat();
  expect(results).toHaveLength(selected.length);
  const bySeed = new Map(selected.map(testCase => [testCase.seed, testCase]));
  return results.filter(result => result.queuedNotGradable.length || result.gradableNotQueued.length)
    .slice(0, 3).map(result => {
      const testCase = bySeed.get(result.seed)!;
      const ids = new Set([...result.queuedNotGradable, ...result.gradableNotQueued]);
      return { ...result, ...testCase, cards: testCase.cards.filter(card => ids.has(card.id)) };
    });
}

// Grading must accept exactly the cards the planner puts in today's queue, or Flow loops on "not due".
describe('review readiness consistency', () => {
  it('agrees on one device across zones, learning-day hours, imports and day boundaries', async () => {
    expect(await failures(cases.filter(sameDevice))).toEqual([]);
  }, 60_000);

  it('agrees when the shared day window comes from a device with another zone or learning-day hour', async () => {
    expect(await failures(cases.filter(testCase => !sameDevice(testCase)))).toEqual([]);
  }, 60_000);
});

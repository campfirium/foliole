// @vitest-environment node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const assembly = parse(fs.readFileSync('.github/workflows/release-assembly.yml', 'utf8'));
const steps = assembly.jobs.assemble.steps;
const verification = steps.find(step => step.name === 'Verify selected producer identities before download');
const sha = 'a'.repeat(40);
const platforms = ['macos', 'windows', 'linux', 'ios'];
const scopes = Array.from({ length: 15 }, (_, index) =>
  platforms.filter((_, bit) => (index + 1) & (1 << bit)));

function run(scope, overrides = {}) {
  const selected = Object.fromEntries(scope.flatMap(platform => [
    [`${platform.toUpperCase()}_SHA`, sha],
    [`${platform.toUpperCase()}_ARTIFACT_NAME`, `${platform}-signed-${sha}`]
  ]));
  return spawnSync('bash', ['-c', verification.run], {
    encoding: 'utf8', env: { PATH: process.env.PATH, TARGET_SHA: sha,
      RELEASE_SCOPE: scope.join(','), ...selected, ...overrides }
  });
}

describe('release assembly producer identity boundary', () => {
  it.each(scopes.map(scope => [scope]))('accepts only %s identities without unselected inputs', scope => {
    expect(run(scope).status).toBe(0);
    for (const platform of scope) {
      const prefix = platform.toUpperCase();
      for (const overrides of [
        { [`${prefix}_SHA`]: 'b'.repeat(40) },
        { [`${prefix}_SHA`]: '' },
        { [`${prefix}_ARTIFACT_NAME`]: '' }
      ]) expect(run(scope, overrides).status).not.toBe(0);
    }
  });

  it('rejects an empty frozen digest before invoking the target checker', () => {
    const identity = steps.find(step => step.id === 'identity');
    expect(spawnSync('bash', ['-c', identity.run], {
      env: { PATH: process.env.PATH, RELEASE_INTENT_DIGEST: '', GITHUB_OUTPUT: '/dev/null' }
    }).status).not.toBe(0);
  });

  it('checks identities before any download and freezes scope before checking identities', () => {
    const index = steps.indexOf(verification);
    expect(steps.findIndex(step => step.id === 'identity')).toBeLessThan(index);
    for (const [downloadIndex, step] of steps.entries()) {
      if (step.uses?.startsWith('actions/download-artifact@')) expect(downloadIndex).toBeGreaterThan(index);
    }
  });
});

// @vitest-environment node

import { Buffer } from 'node:buffer';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/sync-site-downloads.yml', 'utf8'));
const steps = workflow.jobs['notify-site'].steps;
const directory = { schemaVersion: 1, platforms: {}, storeChannels: {} };

function runSync(tracked, { published = directory, eligible = true, failRead = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-download-sync-'));
  try {
    const output = path.join(temp, 'output');
    fs.writeFileSync(output, '');
    const scripts = `
      gh() {
        case "$2" in
          */jobs) printf '%s\\n' "$JOBS_ELIGIBLE" ;;
          */contents/content/downloads.json?ref=main)
            [[ "$FAIL_READ" == false ]] || return 1
            printf '%s' "$TRACKED" ;;
          --method) echo 'notified=true' >> "$GITHUB_OUTPUT" ;;
          *) return 1 ;;
        esac
      }
      curl() {
        case "${'$'}{!#}" in
          https://campfirium.github.io/foliole/releases/downloads.json) printf '%s\\n' "$PUBLISHED" ;;
          https://foliole.app/downloads.json) printf '403' ;;
          *) return 22 ;;
        esac
      }
    `;
    const env = {
      ...process.env,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: 'campfirium/foliole',
      RUN_ID: '1',
      RUN_ATTEMPT: '1',
      RUNNER_TEMP: temp,
      JOBS_ELIGIBLE: String(eligible),
      TRACKED: Buffer.from(JSON.stringify(tracked)).toString('base64'),
      PUBLISHED: JSON.stringify(published),
      FAIL_READ: String(failRead),
    };
    for (const step of steps) {
      const condition = step.if?.match(/outputs\.([a-z]+) == 'true'/u)?.[1];
      if (condition && !fs.readFileSync(output, 'utf8').includes(`${condition}=true\n`)) continue;
      const result = spawnSync('bash', ['-c', `${scripts}\n${step.run}`], { env });
      if (result.error) throw result.error;
      if (result.status !== 0) return { failed: true, notified: false };
    }
    return { failed: false, notified: fs.readFileSync(output, 'utf8').includes('notified=true\n') };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

describe('automatic site download sync', () => {
  it('does not dispatch an unchanged directory even when the production probe would fail', () => {
    expect(runSync(directory)).toEqual({ failed: false, notified: false });
  });

  it('dispatches when the published store data has changed', () => {
    const tracked = { ...directory, storeChannels: { ios: { status: 'in-review' } } };
    expect(runSync(tracked)).toEqual({ failed: false, notified: true });
  });

  it('does not dispatch after an ineligible upstream run or a failed site source read', () => {
    expect(runSync(directory, { eligible: false })).toEqual({ failed: false, notified: false });
    expect(runSync(directory, { failRead: true })).toEqual({ failed: true, notified: false });
  });
});

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { buildPrHandoffData } from './github-desktop-handoff-title.mjs';

const config = {
  failureBuckets: ['fail'],
  includeNoChecks: true,
  repository: 'campfirium/foliole',
  workspace: 'D:\\C\\foliole'
};

const pr = {
  author: { login: 'octocat' },
  baseRefName: 'dev',
  headRefName: 'fix/handoff',
  number: 42,
  title: 'Repair desktop handoff labels',
  url: 'https://github.com/campfirium/foliole/pull/42'
};

describe('GitHub desktop handoff title data', () => {
  it('front-loads the PR number and failing check in the handoff title', () => {
    const data = buildPrHandoffData(config, pr, [
      { bucket: 'pass', name: 'lint' },
      { bucket: 'fail', name: 'test:desktop' }
    ]);

    expect(data.handoffTitle).toBe('PR #42 failed: test:desktop');
    expect(data.prTitle).toBe('Repair desktop handoff labels');
    expect(data.eventId).toBe('42:test:desktop');
  });

  it('uses a distinct title for PRs that have no reported checks', () => {
    const data = buildPrHandoffData(config, pr, []);

    expect(data.handoffTitle).toBe('PR #42 needs checks');
    expect(data.failingChecks).toBe('No checks reported');
    expect(data.eventId).toBe('42:no-checks');
  });

  it('renders the PR handoff title as the first prompt line', () => {
    const templatePath = path.join(process.cwd(), '.codex', 'monitors', 'templates', 'github-prs.md');
    const template = fs.readFileSync(templatePath, 'utf8');
    const data = buildPrHandoffData(config, pr, [{ bucket: 'fail', name: 'quality:desktop' }]);
    const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(data[key] ?? ''));

    expect(rendered.split(/\r?\n/u)[0]).toBe('# PR #42 failed: quality:desktop');
    expect(rendered).toContain('PR: #42 Repair desktop handoff labels');
  });
});

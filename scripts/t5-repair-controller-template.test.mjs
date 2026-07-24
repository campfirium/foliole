import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const skillPath = '.agents/skills/foliole-t5-repair/SKILL.md';
const templatePath = '.codex/monitors/templates/github-actions.md';

describe('T5 repair handoff', () => {
  it('keeps the handoff prompt to locator data and invokes the project skill', () => {
    const template = fs.readFileSync(templatePath, 'utf8');

    expect(template).toContain('Use `$foliole-t5-repair`');
    expect(template).toContain('The handoff is only a locator');
    expect(template).toContain('Run: {{runId}}');
    expect(template).toContain('Commit: {{headSha}}');
    expect(template).toContain('read-only GitHub access needs approval');
    expect(template).not.toContain('For each related problem family');
    expect(template).not.toContain('remote-quality.mjs');
  });

  it('keeps autonomous T5 investigation and repair policy in the skill', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('Treat the handoff payload as a locator');
    expect(skill).toContain('gh run view <run-id>');
    expect(skill).toContain('--log-failed');
    expect(skill).toContain('waiting-for-read-approval');
    expect(skill).toContain('internal collaboration subagents');
    expect(skill).toContain('one worker for each related root-cause family');
    expect(skill).toContain('must not commit, push, trigger hosted quality');
    expect(skill).toContain('explicit user authorization before committing or pushing');
    expect(skill).toContain('remote-quality.mjs --scope full');
    expect(skill).toContain('Do not dispatch another T5 workflow');
    expect(skill).toContain('Never dispatch while either workflow has a nonterminal run');
    expect(skill).toContain('wait until every job reaches a terminal state');
    expect(skill).toContain('hard-refuses a new run while T5 or Remote Quality is active');
    expect(skill).toContain('Do not cancel a run merely because one job failed');
    expect(skill).toContain('Never describe `thread created`');
  });
});

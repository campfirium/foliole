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
    expect(template).toContain('standing authorization for that commit only');
    expect(template).toContain('next scheduled T5 is a separate rolling health sample');
    expect(template).toContain('Do not push, dispatch hosted quality, freeze `dev`');
    expect(template).not.toContain('For each related problem family');
    expect(template).not.toContain('remote-quality.mjs');
  });

  it('keeps rolling local T5 repair policy in the skill', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('Treat the handoff payload as a locator');
    expect(skill).toContain('gh run view <run-id>');
    expect(skill).toContain('--log-failed');
    expect(skill).toContain('waiting-for-read-approval');
    expect(skill).toContain('internal collaboration subagents');
    expect(skill).toContain('one worker for each related root-cause family');
    expect(skill).toContain('must not commit, push, trigger hosted quality');
    expect(skill).toContain('T5 is a rolling health stream');
    expect(skill).toContain('standing authorization to create one local commit');
    expect(skill).toContain('Use `$commit-note`');
    expect(skill).toContain('Never push, dispatch Remote Quality');
    expect(skill).toContain('next scheduled T5 is a separate rolling health sample');
    expect(skill).toContain('Complete the repair lane when all failures');
    expect(skill).toContain('scoped repair is committed locally');
    expect(skill).toContain('Prevention status never blocks repair state `complete`');
    expect(skill).not.toContain('remote-quality.mjs --scope full');
    expect(skill).not.toContain('`rechecking`');
    expect(skill).toContain('Never describe `thread created`');
  });
});

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const skillPath = '.agents/skills/foliole-hosted-quality-repair/SKILL.md';
const metadataPath = '.agents/skills/foliole-hosted-quality-repair/agents/openai.yaml';
const templatePath = '.codex/monitors/templates/github-actions.md';

describe('hosted-quality repair handoff', () => {
  it('keeps the handoff prompt to stable locator data and invokes the generic controller', () => {
    const template = fs.readFileSync(templatePath, 'utf8');

    expect(template).toContain('Use `$foliole-hosted-quality-repair`');
    expect(template).toContain('The handoff is only a locator');
    expect(template).toContain('Workflow file: {{workflowPath}}');
    expect(template).toContain('Run tier: {{runTier}}');
    expect(template).toContain('Read the run, its jobs, and failed logs');
    expect(template).toContain('standing authorization for that commit only');
    expect(template).toContain('scheduled T6 is a separate rolling health sample');
    expect(template).toContain('Do not push, dispatch hosted quality, freeze `dev`');
    expect(template).not.toContain('remote-quality.mjs');
  });

  it('classifies T6 admission failures without making the monitor guess the stage', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('Treat the handoff as a locator, not as failure or stage evidence');
    expect(skill).toContain('Assign `failedStage` only after reading jobs');
    expect(skill).toContain('runTier=T6, failedStage=T5');
    expect(skill).toContain('T6 `full-quality` heavy job was skipped');
    expect(skill).toContain('failedStage=unknown');
    expect(skill).toContain('Only scheduled T6 is a rolling health stream');
  });

  it('keeps local repair, commit, and prevention boundaries tier-independent', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    const metadata = fs.readFileSync(metadataPath, 'utf8');

    expect(skill).toContain('gh run view <run-id>');
    expect(skill).toContain('--log-failed');
    expect(skill).toContain('Use `$commit-note`');
    expect(skill).toContain('Never push, dispatch Remote Quality or another hosted workflow');
    expect(skill).toContain('prevention never blocks repair completion');
    expect(skill).toContain('Never describe `thread created`');
    expect(metadata).toContain('Foliole Hosted Quality Repair');
    expect(metadata).toContain('$foliole-hosted-quality-repair');
    expect(metadata).not.toContain('Foliole T5 Repair');
  });
});

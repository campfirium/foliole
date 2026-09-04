import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const skillPath = '.agents/skills/foliole-hosted-quality-repair/SKILL.md';
const metadataPath = '.agents/skills/foliole-hosted-quality-repair/agents/openai.yaml';
const templatePath = '.codex/monitors/templates/github-actions.md';

describe('hosted-quality repair handoff', () => {
  it('keeps the handoff prompt to stable locator data and invokes the dev T7 controller', () => {
    const template = fs.readFileSync(templatePath, 'utf8');

    expect(template).toContain('Use `$foliole-hosted-quality-repair`');
    expect(template).toContain('failed independent top-level dev T7 Hosted Quality run');
    expect(template).toContain('The handoff is only a locator');
    expect(template).toContain('Workflow file: {{workflowPath}}');
    expect(template).toContain('Run tier: {{runTier}}');
    expect(template).toContain('read the run, its jobs, and failed logs');
    expect(template).toContain('standing authorization for the bounded commit sequence');
    expect(template).toContain('including failures exposed by its registered orchestrator revalidation');
    expect(template).not.toContain('one scoped local repair commit');
    expect(template).toContain('repairState=waiting-for-dev-delivery');
    expect(template).toContain('registered dev Remote Quality orchestrator');
    expect(template).toContain('Never treat a later scheduled T7 Hosted Quality run as repair evidence');
    expect(template).not.toContain('remote-quality.mjs');
  });

  it('classifies nested T5/T6 failures without making the monitor guess the stage', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('A handoff is a locator, not failure or stage evidence');
    expect(skill).toContain('Only an independent `.github/workflows/t7-hosted-quality.yml` run on `dev` is in repair scope');
    expect(skill).toContain('runTier=T7, failedStage=T5');
    expect(skill).toContain('runTier=T7, failedStage=T6');
    expect(skill).toContain('Set `failedStage=T5` only for failure in the nested admission chain');
    expect(skill).toContain('Do not guess when evidence is incomplete');
  });

  it('keeps local repair, commit, and prevention boundaries tier-independent', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    const metadata = fs.readFileSync(metadataPath, 'utf8');

    expect(skill).toContain('gh run view <run-id>');
    expect(skill).toContain('--log-failed');
    expect(skill).toContain('Use `commit-note`');
    expect(skill).toContain('do not impose an artificial commit-count limit');
    expect(skill).toContain('repairState=waiting-for-dev-delivery');
    expect(skill).toContain('reachable from remote `dev`');
    expect(skill).toContain('Never describe task creation, Desktop navigation, or prompt delivery');
    expect(metadata).toContain('Foliole Hosted Quality Repair');
    expect(metadata).toContain('$foliole-hosted-quality-repair');
    expect(metadata).not.toContain('Foliole T5 Repair');
  });
});

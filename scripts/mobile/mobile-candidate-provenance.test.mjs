// @vitest-environment node
import { expect, it } from 'vitest';
import { createPlayRegistration } from './mobile-candidate-provenance.mjs';
import { registrationFixture } from './mobile-candidate-test-fixtures.mjs';

it.each(['dev-remote', 'release-t7'])('binds a signed candidate to actual run, original attempt and full %s quality', lane => {
  const f = registrationFixture(lane);
  f.candidate.untrustedCommand = 'never execute candidate data';
  const payload = createPlayRegistration(f);
  expect(payload).toMatchObject({ sourceSha: f.run.head_sha, signedAttempt: 1, qualityAttempt: 1,
    signedArtifact: { id: 10 }, qualityArtifact: { id: 11 }, lane });
  expect(payload.candidate.untrustedCommand).toBeUndefined();
});

it('rejects foreign workflows, ordinary QA, changed candidates and missing or failed quality before any registration', () => {
  const changes = [
    f => { f.run.head_repository.full_name = 'attacker/foliole'; },
    f => { f.run.path = '.github/workflows/other.yml'; },
    f => { f.run.display_title = `Dev Quality Check (full) @ ${f.run.head_sha.slice(0, 9)}`; },
    f => { f.run.head_branch = 'dev'; },
    f => { f.candidate.sourceSha = 'd'.repeat(40); },
    f => { f.candidate.phase = 'prepared'; },
    f => { f.candidate.certificateSha256 = 'd'.repeat(64); },
    f => { f.quality.run_attempt = 3; },
    f => { f.quality.lane = 'release-t7'; },
    f => { delete f.quality.stages['t6-android-host']; },
    f => { f.quality.stage_shas['t6-android-host'] = 'd'.repeat(40); },
    f => { f.signedArtifact.expired = true; },
    f => { f.signedArtifact.workflow_run.head_sha = 'd'.repeat(40); },
    f => { f.signedArtifact.name = 'android-play-99-1-signed'; },
    f => { delete f.qualityArtifact.digest; },
    f => { f.jobs[0].conclusion = 'failure'; }
  ];
  for (const change of changes) {
    const f = registrationFixture(); change(f);
    expect(() => createPlayRegistration(f)).toThrow();
  }
});

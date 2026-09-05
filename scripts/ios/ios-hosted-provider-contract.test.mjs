// @vitest-environment node
import fs from 'node:fs';

import { expect, it } from 'vitest';

function workflowJob(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

it('activates and verifies pinned npm before each hosted iOS install', () => {
  const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
  const jobs = [
    workflowJob(workflow, '  contract:', '\n  simulator:'),
    workflow.slice(workflow.indexOf('  simulator:'))
  ];

  for (const job of jobs) {
    const activate = job.indexOf('node scripts/quality/pinned-npm.mjs activate');
    const install = job.indexOf('node scripts/quality/hosted-npm-ci.mjs');
    expect(activate).toBeGreaterThan(-1);
    expect(activate).toBeLessThan(install);
  }
});

it('publishes the same dynamic HTTP provider through Electron main and native OS DNS-SD', () => {
  const fixture = fs.readFileSync('scripts/ios/ios-sync-group-provider-fixture.ts', 'utf8');
  const registration = fs.readFileSync('scripts/ios/ios-sync-group-provider-registration.ts', 'utf8');
  const runner = fs.readFileSync('scripts/ios/ios-sync-group-provider-runner.mjs', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
  expect(fixture).toContain("import { app } from 'electron'");
  expect(fixture).toContain('desktop-dnssd-harness-loader.cjs');
  expect(fixture).toMatch(/server\.listen\(0[\s\S]*hostedRegistrationInput\(provider\.discovery, address\.port\)/);
  expect(fixture).toMatch(/await registration\.ready[\s\S]*writeFileSync\(path\.join\(artifactDir, 'service\.json'/);
  expect(fixture).toContain("process.send?.({ kind: 'registered'");
  expect(registration).toContain("type: '_foliole-sync._tcp'");
  expect(registration).toContain("domain: 'local.'");
  expect(runner).toContain("delete env.ELECTRON_RUN_AS_NODE");
  expect(runner).toContain("stdio: ['ignore', 'ignore', 'inherit', 'ipc']");
  expect(runner).toContain("service.send({ kind: 'stop' })");
  expect(workflow).toContain('node node_modules/electron/install.js');
  expect(workflow).toContain('npm run electron:rebuild:native');
});

it('has no endpoint injection, external Bonjour publisher, sidecar, or product discovery branch', () => {
  const sources = [
    'scripts/ios/ios-sync-group-provider-fixture.ts',
    'scripts/ios/ios-sync-group-provider-runner.mjs',
    'scripts/ios/ios-bootstrap-acceptance-attempt.mjs',
    'scripts/ios/ios-foreground-sync-lifecycle-runner.mjs',
    'src/companion/iosAcceptanceSyncGroup.ts'
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const readinessSources = [
    'scripts/ios/ios-sync-group-provider-fixture.ts',
    'scripts/ios/ios-sync-group-provider-runner.mjs',
    'scripts/ios/ios-bootstrap-acceptance-attempt.mjs'
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  expect(sources).not.toMatch(/bonjour-service|\bdns-sd\b|VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT/iu);
  expect(sources).not.toMatch(/spawn\([^\n]*(?:publisher|sidecar)|endpoint_url\s*:/iu);
  expect(readinessSources).not.toContain('waitForAcceptanceObservation');
  expect(sources).not.toMatch(/direct.*candidate|acceptance.*discovery.*branch/iu);
});

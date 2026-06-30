import { expect } from 'vitest';

export const QUALITY_SCRIPT_STEPS = [
  'test:quality:core',
  'test:quality:gate',
  'test:quality:gate-integration:target-telemetry',
  'test:quality:gate-integration:target-collect',
  'test:quality:gate-integration:target-failures',
  'test:quality:gate-integration:routing',
  'test:quality:gate-integration:release-targets',
  'test:quality:gate-integration:fast-delegation',
  'test:quality:gate-integration:release-tail',
  'test:quality:gate-integration:target-core',
  'test:quality:node',
  'test:quality:preview'
];

export function expectStep(stdout, scriptName) {
  expect(stdout).toContain(`dry-run step: ${scriptName}`);
}

export function expectNoQualityMonolithStep(stdout) {
  expect(stdout).not.toMatch(/dry-run step: test:quality\r?\n/u);
}

export function expectNoParallelFanOut(stdout) {
  expect(stdout).not.toContain('running in parallel:');
}

export function extractQualityScriptSteps(stdout) {
  return Array.from(stdout.matchAll(/dry-run step: (test:quality(?::[a-z-]+)*)/gu), (match) => match[1]).sort();
}
